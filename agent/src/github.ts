import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const owner = process.env.GITHUB_OWNER!;
const repo = process.env.GITHUB_REPO!;

export async function createPullRequest(
  title: string,
  body: string,
  branch: string,
  base: string = "main"
): Promise<{ url: string; number: number }> {
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head: branch,
    base,
  });
  return { url: data.html_url, number: data.number };
}

export async function commentOnIssue(
  issueNumber: number,
  body: string
): Promise<void> {
  await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}

export async function createIssue(
  title: string,
  body: string,
  labels: string[]
): Promise<string> {
  const { data } = await octokit.issues.create({ owner, repo, title, body, labels });
  return data.html_url;
}

export async function listOpenIssues(): Promise<{ title: string; number: number }[]> {
  const { data } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  return data.map((i) => ({ title: i.title, number: i.number }));
}

export async function getPullRequestDiff(prNumber: number): Promise<string> {
  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  return data as unknown as string;
}

export async function submitReview(
  prNumber: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body: string
): Promise<void> {
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    event,
    body,
  });
}


export async function addLabelToPR(
  prNumber: number,
  label: string
): Promise<void> {
  await octokit.issues.addLabels({
    owner,
    repo,
    issue_number: prNumber,
    labels: [label],
  });
}

export async function ensureLabelExists(
  name: string,
  color: string = "0075ca",
  description: string = ""
): Promise<void> {
  try {
    await octokit.issues.getLabel({ owner, repo, name });
  } catch {
    // Label doesn't exist — create it
    await octokit.issues.createLabel({ owner, repo, name, color, description });
    console.log(`✅ Created label: ${name}`);
  }
}
