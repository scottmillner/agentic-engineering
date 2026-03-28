/**
 * Review rules for the PR Review Agent.
 * Update these rules to change how the agent evaluates pull requests.
 */

export const reviewRules = `
## Code Review Rules

### Correctness
- PDA must be derived using: Pubkey::find_program_address(&[b"token", owner.as_ref(), mint.as_ref()], &ID)
- Pubkeys must be parsed from strings using Pubkey::from_str().context("...")
- Instruction must be built using the generated:: types (e.g. generated::burn::Burn { amount })
- Transaction must be sent via program.request().instruction(instruction).send()
- Authority/owner must always be the payer keypair

### Test Quality
- Must use #[test] not #[tokio::test]
- Must use setup_validator() and setup_program() helpers
- Must assert on-chain state after the transaction — not just assert!(result.is_ok())
- Must derive the PDA to fetch and verify the account state
- Must chain prerequisites in order: init → create_account → mint_tokens → ...

### Code Style
- Functions must be synchronous — no async/await
- Errors must use anyhow::Result and .context() for descriptive messages
- Output must use the ✓ prefix convention (e.g. println!("✓ Tokens burned"))
- Function signature must match the pattern: pub fn <command>(program, payer, mint, ...) -> Result<()>

### Completeness
- Function must be exported from cli/src/lib.rs
- Function must be imported and called in the match arm in cli/src/main.rs
- Integration test must be added in cli/tests/integration.rs
- PR title must follow conventional commits: feat(cli): implement <command> command

### Review Outcome
- APPROVE if all rules pass
- REQUEST_CHANGES if any rule is violated — cite the specific rule and line number
`;
