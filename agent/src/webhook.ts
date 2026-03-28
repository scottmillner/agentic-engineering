import { Hono } from "hono";
import { serve } from "@hono/node-server";
import "dotenv/config";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { orchestrate } from "./orchestrator.js";
import { commentOnIssue } from "./github.js";

const issuePayloadSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number(),
    title: z.string(),
    labels: z.array(z.object({ name: z.string() })),
  }),
});

const app = new Hono();
const PORT = parseInt(process.env.PORT ?? "3000");
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET!;
const DRY_RUN = process.env.DRY_RUN === "true";

// Verify the request is genuinely from GitHub
function verifySignature(body: string, signature: string): boolean {
  const expected = `sha256=${createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex")}`;
  return (
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}

// Parse the command name from an issue title
// e.g. "implement balance command" → "balance"
function parseCommand(title: string): string | null {
  const match = title.toLowerCase().match(/implement\s+(\w[\w-]*)\s+command/);
  return match ? match[1] : null;
}

app.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256") ?? "";

  // Reject requests that don't come from GitHub
  if (!verifySignature(rawBody, signature)) {
    console.warn("[webhook] Invalid signature — rejected");
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = c.req.header("x-github-event");

  if (event !== "issues") {
    return c.json({ ok: true, skipped: true });
  }

  const parsed = issuePayloadSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    console.warn("[webhook] Invalid payload shape:", parsed.error.flatten());
    return c.json({ error: "Invalid payload" }, 400);
  }
  const payload = parsed.data;

  // Only trigger on newly opened issues with the right label
  if (payload.action !== "opened") {
    return c.json({ ok: true, skipped: true });
  }

  const hasLabel = payload.issue?.labels?.some(
    (l: { name: string }) => l.name === "implement-command"
  );
  if (!hasLabel) {
    return c.json({ ok: true, skipped: true });
  }

  const issueTitle: string = payload.issue.title;
  const issueNumber: number = payload.issue.number;
  const command = parseCommand(issueTitle);

  if (!command) {
    console.warn(`[webhook] Could not parse command from title: "${issueTitle}"`);
    await commentOnIssue(
      issueNumber,
      `❌ Could not parse command name from issue title: \`${issueTitle}\`\n\nExpected format: \`implement <command> command\``
    );
    return c.json({ ok: true, skipped: true });
  }

  // DRY_RUN=true skips the agent — useful for testing the webhook pipeline
  // (signature verification, payload parsing, command extraction) without
  // triggering a real implementation run and incurring API costs.
  if (DRY_RUN) {
    console.log(`[webhook] DRY RUN — would trigger agent for: ${command} (issue #${issueNumber})`);
    return c.json({ ok: true, dryRun: true, command, issueNumber });
  }

  console.log(`[webhook] Triggering orchestrator for command: ${command} (issue #${issueNumber})`);

  // Run the orchestrator in the background — don't block the HTTP response
  orchestrate(command, issueNumber).catch((err) => {
    console.error(`[webhook] Orchestrator error for ${command}:`, err);
  });

  return c.json({ ok: true, command, issueNumber });
});

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n🚀 Webhook server running on http://localhost:${PORT}`);
  console.log(`   Listening for GitHub issue events...\n`);
});
