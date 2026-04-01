import "dotenv/config";
import { runCodingAgent } from "./agents/agent.js";
import { runReviewAgent } from "./agents/review-agent.js";
import { commentOnIssue, addLabelToPR, ensureLabelExists } from "./github.js";

const MAX_REVIEW_LOOPS = 2;

export async function orchestrate(command: string, issueNumber?: number): Promise<void> {
  console.log(`\n🎯 Orchestrator starting — command: ${command}\n`);

  // Step 1: implement the command and open a PR
  const { prNumber, branch } = await runCodingAgent(command, issueNumber);

  let loops = 0;

  while (loops < MAX_REVIEW_LOOPS) {
    loops++;
    console.log(`\n🔄 Review loop ${loops}/${MAX_REVIEW_LOOPS} for PR #${prNumber}\n`);

    // Step 2: review the PR
    const { approved, body } = await runReviewAgent(prNumber);

    if (approved) {
      console.log(`\n✅ PR #${prNumber} approved after ${loops} review loop(s)\n`);
      return;
    }

    if (loops >= MAX_REVIEW_LOOPS) {
      // Max loops reached — comment and label for human review
      console.log(`\n⚠️ Max review loops reached for PR #${prNumber} — escalating to human\n`);

      await ensureLabelExists("needs-human-review", "e4e669", "Max agent review loops reached");
      await addLabelToPR(prNumber, "needs-human-review");
      await commentOnIssue(
        prNumber,
        `⚠️ **Max review loops (${MAX_REVIEW_LOOPS}) reached without approval.**\n\nLast review feedback:\n\n${body}\n\nHuman review required.`
      );
      return;
    }

    // Step 3: fix the issues and push to the existing branch
    console.log(`\n🔧 Fixing issues on branch: ${branch}\n`);
    await runCodingAgent(command, issueNumber, { prNumber, branch, reviewComments: body });
  }
}
