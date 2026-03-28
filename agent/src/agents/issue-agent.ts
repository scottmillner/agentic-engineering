/**
 * Issue Creator Agent — scans the codebase for unimplemented CLI commands
 * and opens GitHub issues for each one so the implementation agent can pick them up.
 *
 * This is a deterministic script, not a Claude agent loop — no LLM needed
 * since the task (find TODOs, create issues) is fully rule-based.
 *
 * Usage: npx tsx src/issue-agent.ts [--dry-run]
 */
import { readFileSync } from "fs";
import "dotenv/config";
import { createIssue, ensureLabelExists, listOpenIssues } from "../github.js";
import { REPO_ROOT } from "../prompts.js";

const DRY_RUN = process.argv.includes("--dry-run");

// Parse TODO commands from main.rs match arms
// Looks for: println!("TODO: implement <command> command")
function findTodoCommands(mainRsPath: string): string[] {
  const contents = readFileSync(mainRsPath, "utf-8");
  const matches = [...contents.matchAll(/TODO: implement (\S+) command/g)];
  return matches.map((m) => m[1]);
}

(async () => {
  const mainRsPath = `${REPO_ROOT}/cli/src/main.rs`;
  const todoCommands = findTodoCommands(mainRsPath);

  if (todoCommands.length === 0) {
    console.log("✅ No TODO commands found — all commands are implemented.");
    return;
  }

  console.log(`\nFound ${todoCommands.length} unimplemented command(s): ${todoCommands.join(", ")}\n`);

  // Ensure the label exists before creating issues
  if (!DRY_RUN) {
    await ensureLabelExists("implement-command", "0075ca", "Triggers the implementation agent");
  }

  // Check existing open issues to avoid duplicates
  const existingIssues = await listOpenIssues();
  const existingTitles = new Set(existingIssues.map((i) => i.title.toLowerCase()));

  for (const command of todoCommands) {
    const title = `implement ${command} command`;

    if (existingTitles.has(title.toLowerCase())) {
      console.log(`⏭️  Skipping "${title}" — issue already exists`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`🔍 DRY RUN — would create issue: "${title}"`);
      continue;
    }

    const url = await createIssue(
      title,
      `Implement the \`${command}\` CLI command following the established pattern in the codebase.\n\n🤖 Created by issue-agent`,
      ["implement-command"]
    );
    console.log(`✅ Created issue: ${url}`);
  }
})();
