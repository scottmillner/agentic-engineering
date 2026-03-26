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
   GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
   PORT=3000
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
| `src/webhook.ts` | Hono webhook server — receives GitHub issue events |

## Webhook Server

The webhook server receives GitHub issue events and triggers the agent automatically.

### Setup

1. Generate a webhook secret:
   ```bash
   openssl rand -hex 32
   ```
   Add to `agent/.env` as `GITHUB_WEBHOOK_SECRET`

2. Install ngrok: https://ngrok.com/download
   Then authenticate:
   ```bash
   ngrok config add-authtoken <your_ngrok_token>
   ```
   Get your token at: https://dashboard.ngrok.com/get-started/your-authtoken

3. Configure GitHub webhook:
   - Go to: `https://github.com/<owner>/<repo>/settings/hooks/new`
   - **Payload URL**: `https://<your-ngrok-url>/webhook`
   - **Content type**: `application/json`
   - **Secret**: your `GITHUB_WEBHOOK_SECRET`
   - **Events**: Issues only
   - **SSL verification**: Enable

### Running

**Terminal 1** — start the webhook server:
```bash
npm run webhook
```

**Terminal 2** — expose it via ngrok:
```bash
ngrok http 3000
```

### Triggering the agent

Open a GitHub issue with:
- **Title**: `implement <command> command` (e.g. `implement balance command`)
- **Label**: `implement-command`

The agent will implement the command, run tests, and open a PR automatically.

### Dry run mode

Set `DRY_RUN=true` in `.env` to test the webhook pipeline without triggering the agent:
```bash
npm run webhook  # with DRY_RUN=true
npx tsx tests/test-webhook.ts
```
