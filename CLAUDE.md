# Solana Token - Development Guide

## Project Overview

A custom Solana token implementation with an Anchor on-chain program and a Rust CLI. The program implements token mint initialization, account creation, minting, transfers, and burning. The CLI provides a command-line interface for interacting with the deployed program.

## Architecture

```
solana-token/
├── programs/solana-token/    # On-chain Anchor program
├── cli/                      # Rust CLI binary + library
│   ├── src/
│   │   ├── main.rs           # CLI entrypoint, command routing (clap)
│   │   ├── lib.rs            # Business logic (init, load_keypair, etc.)
│   │   ├── codegen.rs        # IDL parser and code generator
│   │   └── generated.rs      # Auto-generated from IDL (DO NOT EDIT)
│   ├── build.rs              # Runs codegen at compile time
│   └── tests/
│       ├── integration.rs    # End-to-end tests with test-validator
│       └── generated_code_tests.rs
├── tests/                    # TypeScript integration tests
└── target/idl/               # Generated IDL (from anchor build)
```

**Workspace**: Two crates in a Cargo workspace — `solana-token` (program) and `solana-token-cli` (CLI).

**Program ID**: `48WQW8ZMQKJhV1FKnGrYVDMEoqc8XutQmvKuqcmRrKux`

## Build Workflow

**`anchor build` must run before `cargo build`**. The CLI build script (`build.rs`) reads `target/idl/solana_token.json` to generate `cli/src/generated.rs`. Without the IDL, the CLI won't compile.

```bash
# 1. Build program + generate IDL
anchor build

# 2. Build CLI (build.rs generates types from IDL)
cargo build

# 3. Run CLI
cargo run -p solana-token-cli -- init --decimals 9
```

## Code Generation

The CLI uses IDL-driven code generation to stay in sync with the on-chain program:

1. `anchor build` produces `target/idl/solana_token.json`
2. `cli/build.rs` reads the IDL at compile time
3. Generates `cli/src/generated.rs` with per-instruction modules containing:
   - Instruction struct with args
   - 8-byte discriminator constant
   - `InstructionData` impl for serialization
   - `Accounts` struct with `ToAccountMetas` impl

**Never edit `generated.rs` manually** — it gets overwritten on every build.

## On-Chain Program

### Instructions

| Instruction | Description | Key Accounts |
|---|---|---|
| `initialize` | Create a token mint | mint (init), authority (signer) |
| `create_token_account` | Create a PDA token account | mint, token_account (PDA init), owner, payer |
| `mint_tokens` | Mint tokens to an account | mint (has_one = authority), token_account, authority |
| `transfer` | Transfer between accounts | from (PDA, has_one = owner), to, owner |
| `burn` | Burn tokens from an account | mint, token_account (PDA, has_one = owner), owner |

### Account Types

- **TokenMint** (8 + 32 + 8 + 1 bytes): `authority: Pubkey`, `total_supply: u64`, `decimals: u8`
- **TokenAccount** (8 + 32 + 32 + 8 bytes): `owner: Pubkey`, `mint: Pubkey`, `amount: u64`

### PDA Seeds

Token accounts use PDA: `seeds = [b"token", owner.key(), mint.key()]`

### Error Codes

- `MintMismatch` — token account mint doesn't match provided mint
- `Overflow` — arithmetic overflow
- `InsufficientFunds` — insufficient balance

## CLI

### Implemented Commands

- `init` — Initialize a new token mint (`--decimals`, `--mint-keypair`)

### TODO Commands

- `create-account` — Create token account (`--mint`, `--owner`)
- `mint` — Mint tokens (`--mint`, `--to`, `--amount`)
- `transfer` — Transfer tokens (`--mint`, `--to`, `--amount`)
- `burn` — Burn tokens (`--mint`, `--amount`)
- `balance` — Check balance (`--mint`, `--owner`)
- `mint-info` — Get mint info (`--mint`)

### Global Options

- `-r, --rpc-url` — Solana RPC URL (default: `http://localhost:8899`)
- `-k, --keypair` — Payer keypair path (default: `~/.config/solana/id.json`)

## Testing

```bash
# Unit tests (lib, codegen, generated code)
cargo test --lib

# Integration tests (requires anchor build first for .so file)
cargo test --package solana-token-cli --test integration -- --nocapture

# Generated code tests
cargo test --test generated_code_tests

# TypeScript tests
anchor test
```

**Integration tests** spin up a `solana-test-validator` with the deployed program. They use `#[test]` (not `#[tokio::test]`) because the test validator creates its own tokio runtime internally.

## Code Style

- **Sync over async**: CLI functions are synchronous. `anchor_client::Program::send()` is a blocking RPC call. Don't use `async`/`await` unless the function actually awaits a future.
- **Error handling**: Use `anyhow::Result` and `.context()` for CLI errors. Anchor `#[error_code]` for on-chain errors.
- **Keypair handling**: `load_keypair()` in `lib.rs` supports tilde expansion via `shellexpand`.
- **Naming**: Snake case for modules/functions, PascalCase for types.
- **Rust toolchain**: 1.91.0 with rustfmt and clippy.

## Adding a New CLI Command

The on-chain program already implements all 5 instructions. To add a CLI command:

1. **Add the function in `cli/src/lib.rs`** — follow the pattern in `init()`: build instruction using `generated::` types, send via `program.request()`. Keep it synchronous.
2. **Wire it up in `cli/src/main.rs`** — replace the TODO print in the existing match arm with a call to your function.
3. **Add an integration test in `cli/tests/integration.rs`** — use the existing `setup_validator()` and `setup_program()` helpers. Use `#[test]`, not `#[tokio::test]`.
4. **Run tests**: `cargo test --package solana-token-cli --test integration -- --nocapture`

## Adding a New Program Instruction

1. Add the instruction handler and accounts struct in `programs/solana-token/src/lib.rs`
2. Run `anchor build` to regenerate the IDL
3. Run `cargo build` — `build.rs` will auto-generate the CLI types
4. Implement the CLI command (see above)

## Skills

Available as `/slash-commands` in Claude Code. Scripts are also runnable directly.

| Skill | Command | Description |
|---|---|---|
| build | `/build` | Runs `anchor build` then `cargo build` |
| unit-tests | `/unit-tests` | Runs library and generated code tests |
| integration-tests | `/integration-tests` | Runs integration tests against test validator |
| deploy-local | `/deploy-local` | Starts local validator and deploys the program |
| stop-local | `/stop-local` | Stops the local test validator |

Skills are defined in `.claude/skills/`.

## Common Pitfalls

- **Missing IDL**: If `cargo build` fails with "Failed to read IDL file", run `anchor build` first.
- **Runtime nesting**: Never use `#[tokio::test]` for integration tests — `solana-test-validator` calls `block_on` internally, causing "Cannot start a runtime from within a runtime".
- **Don't edit generated.rs**: It's overwritten by `build.rs` on every compile.
