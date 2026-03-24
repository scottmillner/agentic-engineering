/**
 * Local webhook tester — sends a fake GitHub issue payload to the webhook server.
 * Usage: npx tsx src/test-webhook.ts
 *
 * Requires the webhook server to be running: npm run webhook
 */
import { createHmac } from "crypto";
import "dotenv/config";

const SECRET = process.env.GITHUB_WEBHOOK_SECRET!;
const PORT = process.env.PORT ?? "3000";
const URL = `http://localhost:${PORT}/webhook`;

const payload = JSON.stringify({
  action: "opened",
  issue: {
    number: 99,
    title: "implement balance command",
    labels: [{ name: "implement-command" }],
  },
});

const signature = `sha256=${createHmac("sha256", SECRET)
  .update(payload)
  .digest("hex")}`;

console.log(`\nSending test payload to ${URL}`);
console.log(`Signature: ${signature.slice(0, 20)}...\n`);

const response = await fetch(URL, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-github-event": "issues",
    "x-hub-signature-256": signature,
  },
  body: payload,
});

const json = await response.json();
console.log(`Status: ${response.status}`);
console.log(`Response:`, json);
