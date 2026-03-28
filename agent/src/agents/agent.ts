import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { executeTool, toolDefinitions } from "../tools.js";
import { systemPrompt } from "../prompts.js";
import { createPullRequest } from "../github.js";

const client = new Anthropic();

export async function runAgent(command: string, issueNumber?: number): Promise<void> {
  console.log(`\n🤖 Agent starting — implementing: ${command}\n`);

  const branch = `implement/${command}`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Implement the "${command}" CLI command following the established pattern in this codebase.

After the test passes:
1. Create a new branch: ${branch}
2. Commit the changed files (cli/src/lib.rs, cli/src/main.rs, cli/tests/integration.rs)
3. Push the branch to origin
`,
    },
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

      console.log(`\n📬 Opening PR for branch: ${branch}`);
      const prUrl = await createPullRequest(
        `feat(cli): implement ${command} command`,
        prBody,
        branch
      );
      console.log(`✅ PR opened: ${prUrl}\n`);

      break;
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

  runAgent(command, issueNumber).catch((err) => {
    console.error("Agent error:", err);
    process.exit(1);
  });
}
