# Agentic Engineering

A working demonstration of AI agents as a software development team — autonomously implementing features, running tests, opening pull requests, and reviewing code, while a human architect defines the vision and reviews the output.

---

## The Philosophy

The role of a software engineer is shifting. The most valuable skill is no longer writing code — it's **thinking clearly about what needs to be built and why**.

AI agents can implement, test, review, and iterate. What they can't do is decide what matters, understand business context, or make architectural trade-offs. That's the human's job.

> **Engineers think. Agents execute. Humans review.**

The engineer's value is in designing systems, defining quality standards, and building the infrastructure that makes agents reliable. Agentic workflows are where the industry is heading — this repo is my exploration of what that looks like in practice.

---

## The Pipeline

```
Issue Agent scans the codebase for unimplemented features
    → opens a GitHub issue for each one
    ↓
Webhook server receives the issue event
    ↓
Orchestrator coordinates the agents
    ↓
Coding Agent (Claude SDK)
    → reads the codebase
    → implements the feature
    → runs integration tests
    → commits and pushes to a branch
    → opens a pull request
    ↓
Review Agent (GitHub App bot)
    → reads the diff
    → evaluates against defined rules
    → approves or requests changes
    ↓
If changes requested:
    → Coding Agent reads feedback and fixes
    → Review Agent reviews again (max 2 loops)
    → If still failing: labels PR "needs-human-review"
    ↓
Developer reviews the PR and merges
```

The developer's only manual step is reviewing and merging the PR.

---

## Agent Architecture

| Agent | Type | Purpose |
|---|---|---|
| **Issue Creator** | Deterministic script | Scans codebase for unimplemented features, opens GitHub issues |
| **Coding Agent** | Claude SDK agentic loop | Implements features end-to-end — reads code, writes code, runs tests, commits |
| **Review Agent** | Claude SDK agentic loop | Reviews PRs against defined rules, approves or requests changes |
| **Orchestrator** | Coordinator | Runs the implementation → review → fix loop, enforces max iterations |
| **Webhook Server** | Hono HTTP server | Receives GitHub events, triggers the orchestrator |

### Tools available to agents

- `read_file` — read any file in the codebase
- `write_file` — write or update files
- `run_bash` — execute shell commands (build, test, etc.)
- `git_create_branch`, `git_commit`, `git_push` — git operations
- `submit_review` — post a PR review via GitHub API

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI Agents | [Claude Agent SDK](https://docs.anthropic.com) (`@anthropic-ai/sdk`) |
| Webhook Server | [Hono](https://hono.dev) + `@hono/node-server` |
| GitHub Integration | `@octokit/rest` |
| Local Tunnel | ngrok |
| Runtime | Node.js + TypeScript (`tsx`) |
| Underlying Program | Solana / [Anchor](https://anchor-lang.com) |
| CLI | Rust (`clap`, `anchor-client`) |

---

## The Underlying Project

The agents are building a **Solana token program** — a custom on-chain token implementation with mint, transfer, burn, and balance functionality. The program is written in Rust using the Anchor framework.

The Solana project exists to give the agents a real, non-trivial codebase to work in — with IDL-driven code generation, integration tests against a local validator, and strict conventions. It's a meaningful test of whether agents can maintain quality in a complex environment.

---

## Getting Started

### Prerequisites
- Node.js 18+
- Rust + Anchor CLI (for the Solana program)
- ngrok account (for local webhook testing)
- Anthropic API key
- GitHub Personal Access Token

### Setup

```bash
cd agent
npm install
cp .env.example .env
# fill in your credentials
```

See [`agent/README.md`](./agent/README.md) for full setup instructions including ngrok and GitHub webhook configuration.

### Running the pipeline

**Start the webhook server:**
```bash
cd agent && npm run webhook
```

**Expose it via ngrok:**
```bash
ngrok http 3000
```

**Trigger the full pipeline:**
```bash
cd agent && npm run issues   # opens GitHub issues for unimplemented commands
```

Then watch the agents work.

---

