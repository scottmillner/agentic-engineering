import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { executeTool, toolDefinitions, submitReviewToolDefinition } from "../tools.js";
import { REPO_ROOT } from "../prompts.js";
import { reviewRules } from "../rules.js";
import { getPullRequestDiff, submitReview } from "../github.js";

const client = new Anthropic();

const systemPrompt = `
You are a senior engineer reviewing pull requests for a Solana token CLI project.

## Your task
Review the provided PR diff against the rules below. Then:
1. Read the relevant source files to verify completeness
2. Decide: APPROVE or REQUEST_CHANGES
3. Write a concise review comment explaining your decision
4. Call submit_review with your decision and comment

## Codebase
Repo root: ${REPO_ROOT}
Key files:
- cli/src/lib.rs        — CLI business logic
- cli/src/main.rs       — CLI entrypoint
- cli/tests/integration.rs — Integration tests

${reviewRules}
`;

const reviewToolDefinitions = [...toolDefinitions, submitReviewToolDefinition];

export async function runReviewAgent(prNumber: number): Promise<void> {
  console.log(`\n🔍 Review agent starting — PR #${prNumber}\n`);

  const diff = await getPullRequestDiff(prNumber);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Review PR #${prNumber}.\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``,
    },
  ];

  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools: reviewToolDefinitions,
      messages,
    });

    console.log(`[review-agent] stop_reason: ${response.stop_reason}`);

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      console.log("\n✅ Review agent finished\n");
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      console.log(`[tool] ${block.name}(${JSON.stringify(block.input)})`);

      let result: string;
      if (block.name === "submit_review") {
        const { event, body } = block.input as { event: "APPROVE" | "REQUEST_CHANGES"; body: string };
        await submitReview(prNumber, event, body);
        result = `Review submitted: ${event}`;
        console.log(`\n📝 Review submitted: ${event}\n`);
      } else {
        result = executeTool(block.name, block.input as Record<string, string>);
      }

      console.log(`[tool] → ${result.slice(0, 120)}${result.length > 120 ? "…" : ""}\n`);

      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }

    messages.push({ role: "user", content: toolResults });
  }
}

// Run as CLI: npx tsx src/review-agent.ts <pr-number>
const isMain = process.argv[1]?.includes("agents/review-agent");
if (isMain) {
  const prNumber = parseInt(process.argv[2]);
  if (!prNumber) {
    console.error("Usage: tsx src/review-agent.ts <pr-number>");
    process.exit(1);
  }
  runReviewAgent(prNumber).catch((err) => {
    console.error("Review agent error:", err);
    process.exit(1);
  });
}
