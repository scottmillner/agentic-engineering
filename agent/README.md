# Solana Token Agent

An AI agent that autonomously implements CLI commands for the Solana token program using the Claude Agent SDK.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create your `.env` file:
   ```bash
   cp .env.example .env
   ```
   Add your credentials to `.env`:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   GITHUB_TOKEN=your_github_token_here
   GITHUB_OWNER=your_github_username
   GITHUB_REPO=solana-token
   ```

## Usage

Run the agent with a command name to implement:

```bash
npx tsx src/agent.ts <command>
```

**Examples:**
```bash
npx tsx src/agent.ts transfer
npx tsx src/agent.ts burn
npx tsx src/agent.ts balance
npx tsx src/agent.ts mint-info
```

The agent will:
1. Read the codebase to understand the existing pattern
2. Implement the command in `cli/src/lib.rs` and `cli/src/main.rs`
3. Write an integration test in `cli/tests/integration.rs`
4. Run the test to verify correctness
5. Create a branch, commit the changes, push to origin
6. Open a PR on GitHub

Optionally pass a GitHub issue number to link the PR:
```bash
npx tsx src/agent.ts burn 42
```

## Architecture

| File | Purpose |
|---|---|
| `src/agent.ts` | Main agentic loop |
| `src/tools.ts` | Tool definitions and executors (read_file, write_file, run_bash, git tools) |
| `src/prompts.ts` | System prompt with codebase context |
| `src/github.ts` | GitHub API client (create PR, comment on issue) |
