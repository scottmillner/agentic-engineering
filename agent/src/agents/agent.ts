import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { executeTool, toolDefinitions } from "../tools.js";
import { systemPrompt } from "../prompts.js";
import { createPullRequest } from "../github.js";

const client = new Anthropic();

export interface AgentResult {
  prNumber: number;
  branch: string;
}

export interface FixOptions {
  prNumber: number;
  branch: string;
  reviewComments: string;
}

export async function runCodingAgent(
  command: string,
  issueNumber?: number,
  fix?: FixOptions
): Promise<AgentResult> {
  const branch = fix?.branch ?? `implement/${command}`;
  const mode = fix ? "fix" : "implement";

  console.log(`\n🤖 Agent starting — ${mode}: ${command}\n`);

  const userMessage = fix
    ? `The PR for the "${command}" command received review feedback. Fix the issues and push to the existing branch: ${branch}.

Review comments:
${fix.reviewComments}

Push to the existing branch — do NOT create a new branch.`
    : `Implement the "${command}" CLI command following the established pattern in this codebase.

After the test passes:
1. Create a new branch: ${branch}
2. Commit the changed files (cli/src/lib.rs, cli/src/main.rs, cli/tests/integration.rs)
3. Push the branch to origin`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  // Agentic loop — keep going until the model stops calling tools
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8096,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    });

    console.log(`[agent] stop_reason: ${response.stop_reason}`);

    // Add assistant response to message history
    messages.push({ role: "assistant", content: response.content });

    // If no more tool calls, open the PR and we're done
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        console.log(`\n✅ Agent finished:\n\n${textBlock.text}\n`);
      }

      const prBody = [
        `## Summary`,
        `Implements the \`${command}\` CLI command.`,
        ``,
        `## Changes`,
        `- Added \`${command}\` function in \`cli/src/lib.rs\``,
        `- Wired up match arm in \`cli/src/main.rs\``,
        `- Added integration test in \`cli/tests/integration.rs\``,
        issueNumber ? `\nCloses #${issueNumber}` : "",
        ``,
        `🤖 Generated with Claude Agent SDK`,
      ].join("\n");

      // In fix mode the PR already exists — no need to open a new one
      if (fix) {
        console.log(`\n✅ Fixes pushed to branch: ${branch}\n`);
        return { prNumber: fix.prNumber, branch };
      }

      console.log(`\n📬 Opening PR for branch: ${branch}`);
      const pr = await createPullRequest(
        `feat(cli): implement ${command} command`,
        prBody,
        branch
      );
      console.log(`✅ PR opened: ${pr.url}\n`);
      return { prNumber: pr.number, branch };
    }

    // Execute all tool calls and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      console.log(`[tool] ${block.name}(${JSON.stringify(block.input)})`);
      const result = executeTool(
        block.name,
        block.input as Record<string, string>
      );
      console.log(
        `[tool] → ${result.slice(0, 120)}${result.length > 120 ? "…" : ""}\n`
      );

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    // Feed results back to the model
    messages.push({ role: "user", content: toolResults });
  }

  // Unreachable — while(true) always exits via return above.
  // Required to satisfy TypeScript's exhaustive return check.
  throw new Error("Agent loop ended without returning a result");
}

// Only run as CLI when executed directly, not when imported by webhook.ts
const isMain = process.argv[1]?.includes("agents/agent");
if (isMain) {
  const command = process.argv[2];
  const issueNumber = process.argv[3] ? parseInt(process.argv[3]) : undefined;

  if (!command) {
    console.error("Usage: tsx src/agent.ts <command-name> [issue-number]");
    console.error("Example: tsx src/agent.ts burn 42");
    process.exit(1);
  }

  runCodingAgent(command, issueNumber).catch((err) => {
    console.error("Agent error:", err);
    process.exit(1);
  });
}
