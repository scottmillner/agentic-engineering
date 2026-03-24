use anchor_client::{
    solana_sdk::{
        commitment_config::CommitmentConfig,
        signature::{Keypair, Signer},
    },
    Client, Cluster,
};
use solana_streamer::socket::SocketAddrSpace;
use solana_test_validator::{TestValidatorGenesis, UpgradeableProgramInfo};
use solana_token_cli::{balance, burn, create_account, init, mint_tokens, transfer, ID};
use std::io::Write;
use std::path::PathBuf;
use std::rc::Rc;

fn setup_validator() -> (solana_test_validator::TestValidator, Keypair) {
    let payer = Keypair::new();

    // Path to the compiled program
    let program_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("target/deploy/solana_token.so");

    let mut genesis = TestValidatorGenesis::default();
    genesis.add_upgradeable_programs_with_path(&[UpgradeableProgramInfo {
        program_id: ID,
        loader: solana_sdk::bpf_loader_upgradeable::id(),
        upgrade_authority: Keypair::new().pubkey(),
        program_path,
    }]);

    let validator = genesis
        .start_with_mint_address(payer.pubkey(), SocketAddrSpace::Unspecified)
        .expect("Failed to start test validator");

    (validator, payer)
}

fn setup_program(
    validator: &solana_test_validator::TestValidator,
    payer: Rc<Keypair>,
) -> anchor_client::Program<Rc<Keypair>> {
    let cluster = Cluster::Custom(validator.rpc_url(), validator.rpc_pubsub_url());
    let client = Client::new_with_options(cluster, payer.clone(), CommitmentConfig::confirmed());
    client.program(ID).expect("Failed to create program client")
}

#[test]
fn test_init() {
    let (validator, payer) = setup_validator();
    let payer = Rc::new(payer);
    let program = setup_program(&validator, payer.clone());

    let result = init(&program, &payer, 9, None);

    assert!(result.is_ok(), "init failed: {:?}", result.err());
}

#[test]
fn test_create_account() {
    let (validator, payer) = setup_validator();
    let payer = Rc::new(payer);
    let program = setup_program(&validator, payer.clone());

    // Generate a mint keypair and save to a temp file so we know its pubkey
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let mint_bytes = mint_keypair.to_bytes();
    let mut temp_file = tempfile::NamedTempFile::new().unwrap();
    temp_file
        .write_all(
            serde_json::to_string(&mint_bytes.to_vec())
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
    let mint_path = temp_file.path().to_str().unwrap().to_string();

    // Initialize the mint first
    let init_result = init(&program, &payer, 9, Some(mint_path));
    assert!(init_result.is_ok(), "init failed: {:?}", init_result.err());

    // Create a token account for the payer (owner defaults to payer)
    let result = create_account(&program, &payer, &mint_pubkey.to_string(), None);
    assert!(result.is_ok(), "create_account failed: {:?}", result.err());
}

#[test]
fn test_mint_tokens() {
    let (validator, payer) = setup_validator();
    let payer = Rc::new(payer);
    let program = setup_program(&validator, payer.clone());

    // Generate a mint keypair and save to a temp file
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let mint_bytes = mint_keypair.to_bytes();
    let mut temp_file = tempfile::NamedTempFile::new().unwrap();
    temp_file
        .write_all(
            serde_json::to_string(&mint_bytes.to_vec())
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
    let mint_path = temp_file.path().to_str().unwrap().to_string();

    // Initialize the mint
    let init_result = init(&program, &payer, 9, Some(mint_path));
    assert!(init_result.is_ok(), "init failed: {:?}", init_result.err());

    // Create a token account for the payer
    let create_result = create_account(&program, &payer, &mint_pubkey.to_string(), None);
    assert!(
        create_result.is_ok(),
        "create_account failed: {:?}",
        create_result.err()
    );

    // Mint tokens to the payer's token account
    let result = mint_tokens(
        &program,
        &payer,
        &mint_pubkey.to_string(),
        &payer.pubkey().to_string(),
        1000,
    );
    assert!(result.is_ok(), "mint_tokens failed: {:?}", result.err());

    // Derive the token account PDA to verify the balance
    let (token_account_pubkey, _bump) = solana_sdk::pubkey::Pubkey::find_program_address(
        &[b"token", payer.pubkey().as_ref(), mint_pubkey.as_ref()],
        &ID,
    );

    let token_account: solana_token::TokenAccount =
        program.account(token_account_pubkey).unwrap();
    assert_eq!(token_account.amount, 1000);
}

#[test]
fn test_transfer() {
    let (validator, payer) = setup_validator();
    let payer = Rc::new(payer);
    let program = setup_program(&validator, payer.clone());

    // Generate a mint keypair and save to a temp file
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let mint_bytes = mint_keypair.to_bytes();
    let mut temp_file = tempfile::NamedTempFile::new().unwrap();
    temp_file
        .write_all(
            serde_json::to_string(&mint_bytes.to_vec())
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
    let mint_path = temp_file.path().to_str().unwrap().to_string();

    // Initialize the mint
    let init_result = init(&program, &payer, 9, Some(mint_path));
    assert!(init_result.is_ok(), "init failed: {:?}", init_result.err());

    // Generate a recipient keypair
    let recipient = Keypair::new();

    // Create token accounts for both sender (payer) and recipient
    let create_sender = create_account(&program, &payer, &mint_pubkey.to_string(), None);
    assert!(
        create_sender.is_ok(),
        "create_account (sender) failed: {:?}",
        create_sender.err()
    );

    let create_recipient = create_account(
        &program,
        &payer,
        &mint_pubkey.to_string(),
        Some(&recipient.pubkey().to_string()),
    );
    assert!(
        create_recipient.is_ok(),
        "create_account (recipient) failed: {:?}",
        create_recipient.err()
    );

    // Mint 1000 tokens to the payer's token account
    let mint_result = mint_tokens(
        &program,
        &payer,
        &mint_pubkey.to_string(),
        &payer.pubkey().to_string(),
        1000,
    );
    assert!(
        mint_result.is_ok(),
        "mint_tokens failed: {:?}",
        mint_result.err()
    );

    // Transfer 400 tokens from payer to recipient
    let transfer_result = transfer(
        &program,
        &payer,
        &mint_pubkey.to_string(),
        &recipient.pubkey().to_string(),
        400,
    );
    assert!(
        transfer_result.is_ok(),
        "transfer failed: {:?}",
        transfer_result.err()
    );

    // Derive PDAs to verify final balances
    let (sender_token_account, _) = solana_sdk::pubkey::Pubkey::find_program_address(
        &[b"token", payer.pubkey().as_ref(), mint_pubkey.as_ref()],
        &ID,
    );
    let (recipient_token_account, _) = solana_sdk::pubkey::Pubkey::find_program_address(
        &[b"token", recipient.pubkey().as_ref(), mint_pubkey.as_ref()],
        &ID,
    );

    let sender_account: solana_token::TokenAccount =
        program.account(sender_token_account).unwrap();
    let recipient_account: solana_token::TokenAccount =
        program.account(recipient_token_account).unwrap();

    assert_eq!(sender_account.amount, 600, "sender balance should be 600");
    assert_eq!(
        recipient_account.amount, 400,
        "recipient balance should be 400"
    );
}

#[test]
fn test_burn() {
    let (validator, payer) = setup_validator();
    let payer = Rc::new(payer);
    let program = setup_program(&validator, payer.clone());

    // Generate a mint keypair and save to a temp file
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let mint_bytes = mint_keypair.to_bytes();
    let mut temp_file = tempfile::NamedTempFile::new().unwrap();
    temp_file
        .write_all(
            serde_json::to_string(&mint_bytes.to_vec())
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
    let mint_path = temp_file.path().to_str().unwrap().to_string();

    // Initialize the mint
    let init_result = init(&program, &payer, 9, Some(mint_path));
    assert!(init_result.is_ok(), "init failed: {:?}", init_result.err());

    // Create a token account for the payer
    let create_result = create_account(&program, &payer, &mint_pubkey.to_string(), None);
    assert!(
        create_result.is_ok(),
        "create_account failed: {:?}",
        create_result.err()
    );

    // Mint 1000 tokens to the payer's token account
    let mint_result = mint_tokens(
        &program,
        &payer,
        &mint_pubkey.to_string(),
        &payer.pubkey().to_string(),
        1000,
    );
    assert!(
        mint_result.is_ok(),
        "mint_tokens failed: {:?}",
        mint_result.err()
    );

    // Burn 300 tokens from the payer's token account
    let burn_result = burn(&program, &payer, &mint_pubkey.to_string(), 300);
    assert!(
        burn_result.is_ok(),
        "burn failed: {:?}",
        burn_result.err()
    );

    // Derive the payer's token account PDA to verify balance
    let (token_account_pubkey, _bump) = solana_sdk::pubkey::Pubkey::find_program_address(
        &[b"token", payer.pubkey().as_ref(), mint_pubkey.as_ref()],
        &ID,
    );

    let token_account: solana_token::TokenAccount =
        program.account(token_account_pubkey).unwrap();
    assert_eq!(token_account.amount, 700, "token balance should be 700 after burning 300");

    // Also verify the mint's total_supply was reduced
    let mint_account: solana_token::TokenMint = program.account(mint_pubkey).unwrap();
    assert_eq!(mint_account.total_supply, 700, "total supply should be 700 after burning 300");
}

#[test]
fn test_balance() {
    let (validator, payer) = setup_validator();
    let payer = Rc::new(payer);
    let program = setup_program(&validator, payer.clone());

    // Generate a mint keypair and save to a temp file
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let mint_bytes = mint_keypair.to_bytes();
    let mut temp_file = tempfile::NamedTempFile::new().unwrap();
    temp_file
        .write_all(
            serde_json::to_string(&mint_bytes.to_vec())
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
    let mint_path = temp_file.path().to_str().unwrap().to_string();

    // Initialize the mint
    let init_result = init(&program, &payer, 9, Some(mint_path));
    assert!(init_result.is_ok(), "init failed: {:?}", init_result.err());

    // Create a token account for the payer (owner defaults to payer)
    let create_result = create_account(&program, &payer, &mint_pubkey.to_string(), None);
    assert!(
        create_result.is_ok(),
        "create_account failed: {:?}",
        create_result.err()
    );

    // Mint 500 tokens to the payer's token account
    let mint_result = mint_tokens(
        &program,
        &payer,
        &mint_pubkey.to_string(),
        &payer.pubkey().to_string(),
        500,
    );
    assert!(
        mint_result.is_ok(),
        "mint_tokens failed: {:?}",
        mint_result.err()
    );

    // Check balance — owner defaults to payer
    let bal = balance(&program, &payer, &mint_pubkey.to_string(), None);
    assert!(bal.is_ok(), "balance failed: {:?}", bal.err());
    assert_eq!(bal.unwrap(), 500, "balance should be 500 after minting");

    // Check balance with explicit owner string — should return same value
    let bal_explicit = balance(
        &program,
        &payer,
        &mint_pubkey.to_string(),
        Some(&payer.pubkey().to_string()),
    );
    assert!(
        bal_explicit.is_ok(),
        "balance (explicit owner) failed: {:?}",
        bal_explicit.err()
    );
    assert_eq!(
        bal_explicit.unwrap(),
        500,
        "balance with explicit owner should also be 500"
    );
}
