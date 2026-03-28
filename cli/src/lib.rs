pub mod codegen;
pub mod generated;

use anchor_client::{
    anchor_lang::{declare_id, InstructionData, ToAccountMetas},
    solana_sdk::{
        instruction::Instruction,
        pubkey::Pubkey,
        signature::{Keypair, Signer},
    },
    Program,
};
use anyhow::{Context, Result};
use solana_system_interface::program as system_program;
use std::{fs, rc::Rc, str::FromStr};

declare_id!("48WQW8ZMQKJhV1FKnGrYVDMEoqc8XutQmvKuqcmRrKux");

pub fn load_keypair(path: &str) -> Result<Keypair> {
    let expanded_path = shellexpand::tilde(path);
    let file_contents = fs::read_to_string(expanded_path.as_ref())?;
    let keypair_bytes: Vec<u8> = serde_json::from_str(&file_contents)?;
    let keypair = Keypair::from_bytes(&keypair_bytes.as_slice())
        .map_err(|e| anyhow::anyhow!("Invalid keypair: {}", e))?;
    Ok(keypair)
}

pub fn init(
    program: &Program<Rc<Keypair>>,
    payer: &Keypair,
    decimals: u8,
    mint_keypair: Option<String>,
) -> Result<()> {
    // Load or generate mint keypair
    let mint = match mint_keypair {
        Some(path) => load_keypair(&path).context("Failed to load mint keypair")?,
        None => {
            let keypair = Keypair::new();
            let path = format!("mint-{}.json", keypair.pubkey());

            // Save keypair to disk
            let keypair_bytes = keypair.to_bytes();
            fs::write(&path, serde_json::to_string(&keypair_bytes.to_vec())?)
                .context("Failed to write mint keypair to disk")?;

            println!("Generated new mint keypair: {}", path);
            keypair
        }
    };

    // Build initialize instruction using generated code
    let initialize = generated::initialize::Initialize { decimals };
    let accounts = generated::initialize::Accounts {
        mint: mint.pubkey(),
        authority: payer.pubkey(),
        system_program: system_program::ID.to_bytes().into(),
    };

    // Create instruction
    let instruction = Instruction {
        program_id: ID,
        accounts: accounts.to_account_metas(None),
        data: initialize.data(),
    };

    // Send transaction with mint as additional signer
    let signature = program
        .request()
        .instruction(instruction)
        .signer(&mint)
        .send()
        .context("Failed to send initialize transaction")?;

    // Print results
    println!("✓ Token mint initialized");
    println!("  Mint address: {}", mint.pubkey());
    println!("  Decimals: {}", decimals);
    println!("  Transaction: {}", signature);

    Ok(())
}

pub fn create_account(
    program: &Program<Rc<Keypair>>,
    payer: &Keypair,
    mint: &str,
    owner: Option<&str>,
) -> Result<()> {
    let mint_pubkey = Pubkey::from_str(mint).context("Invalid mint address")?;
    let owner_pubkey = match owner {
        Some(o) => Pubkey::from_str(o).context("Invalid owner address")?,
        None => payer.pubkey(),
    };

    // Derive the PDA — must match seeds in the on-chain program
    let (token_account_pubkey, _bump) = Pubkey::find_program_address(
        &[b"token", owner_pubkey.as_ref(), mint_pubkey.as_ref()],
        &ID,
    );

    let instruction_data = generated::create_token_account::CreateTokenAccount {};
    let accounts = generated::create_token_account::Accounts {
        mint: mint_pubkey,
        token_account: token_account_pubkey,
        owner: owner_pubkey,
        payer: payer.pubkey(),
        system_program: system_program::ID.to_bytes().into(),
    };

    let instruction = Instruction {
        program_id: ID,
        accounts: accounts.to_account_metas(None),
        data: instruction_data.data(),
    };

    let signature = program
        .request()
        .instruction(instruction)
        .send()
        .context("Failed to send create_token_account transaction")?;

    println!("✓ Token account created");
    println!("  Token account: {}", token_account_pubkey);
    println!("  Owner: {}", owner_pubkey);
    println!("  Mint: {}", mint_pubkey);
    println!("  Transaction: {}", signature);

    Ok(())
}

pub fn mint_tokens(
    program: &Program<Rc<Keypair>>,
    payer: &Keypair,
    mint: &str,
    to: &str,
    amount: u64,
) -> Result<()> {
    let mint_pubkey = Pubkey::from_str(mint).context("Invalid mint address")?;
    let owner_pubkey = Pubkey::from_str(to).context("Invalid owner address")?;

    // Derive the recipient's token account PDA
    let (token_account_pubkey, _bump) = Pubkey::find_program_address(
        &[b"token", owner_pubkey.as_ref(), mint_pubkey.as_ref()],
        &ID,
    );

    let instruction_data = generated::mint_tokens::MintTokens { amount };
    let accounts = generated::mint_tokens::Accounts {
        mint: mint_pubkey,
        token_account: token_account_pubkey,
        authority: payer.pubkey(),
    };

    let instruction = Instruction {
        program_id: ID,
        accounts: accounts.to_account_metas(None),
        data: instruction_data.data(),
    };

    let signature = program
        .request()
        .instruction(instruction)
        .send()
        .context("Failed to send mint_tokens transaction")?;

    println!("✓ Tokens minted");
    println!("  Token account: {}", token_account_pubkey);
    println!("  Owner: {}", owner_pubkey);
    println!("  Amount: {}", amount);
    println!("  Transaction: {}", signature);

    Ok(())
}

pub fn transfer(
    program: &Program<Rc<Keypair>>,
    payer: &Keypair,
    mint: &str,
    to: &str,
    amount: u64,
) -> Result<()> {
    let mint_pubkey = Pubkey::from_str(mint).context("Invalid mint address")?;
    let recipient_pubkey = Pubkey::from_str(to).context("Invalid recipient address")?;

    // Derive the sender's token account PDA (payer is the owner/signer)
    let (from_token_account, _bump) = Pubkey::find_program_address(
        &[b"token", payer.pubkey().as_ref(), mint_pubkey.as_ref()],
        &ID,
    );

    // Derive the recipient's token account PDA
    let (to_token_account, _bump) = Pubkey::find_program_address(
        &[b"token", recipient_pubkey.as_ref(), mint_pubkey.as_ref()],
        &ID,
    );

    let instruction_data = generated::transfer::Transfer { amount };
    let accounts = generated::transfer::Accounts {
        from: from_token_account,
        to: to_token_account,
        owner: payer.pubkey(),
    };

    let instruction = Instruction {
        program_id: ID,
        accounts: accounts.to_account_metas(None),
        data: instruction_data.data(),
    };

    let signature = program
        .request()
        .instruction(instruction)
        .send()
        .context("Failed to send transfer transaction")?;

    println!("✓ Tokens transferred");
    println!("  From account: {}", from_token_account);
    println!("  To account:   {}", to_token_account);
    println!("  Recipient:    {}", recipient_pubkey);
    println!("  Amount:       {}", amount);
    println!("  Transaction:  {}", signature);

    Ok(())
}

pub fn burn(
    program: &Program<Rc<Keypair>>,
    payer: &Keypair,
    mint: &str,
    amount: u64,
) -> Result<()> {
    let mint_pubkey = Pubkey::from_str(mint).context("Invalid mint address")?;

    // Derive the payer's token account PDA — payer is the owner/signer
    let (token_account_pubkey, _bump) = Pubkey::find_program_address(
        &[b"token", payer.pubkey().as_ref(), mint_pubkey.as_ref()],
        &ID,
    );

    let instruction_data = generated::burn::Burn { amount };
    let accounts = generated::burn::Accounts {
        mint: mint_pubkey,
        token_account: token_account_pubkey,
        owner: payer.pubkey(),
    };

    let instruction = Instruction {
        program_id: ID,
        accounts: accounts.to_account_metas(None),
        data: instruction_data.data(),
    };

    let signature = program
        .request()
        .instruction(instruction)
        .send()
        .context("Failed to send burn transaction")?;

    println!("✓ Tokens burned");
    println!("  Token account: {}", token_account_pubkey);
    println!("  Owner: {}", payer.pubkey());
    println!("  Mint: {}", mint_pubkey);
    println!("  Amount: {}", amount);
    println!("  Transaction: {}", signature);

    Ok(())
}

pub fn mint_info(program: &Program<Rc<Keypair>>, mint: &str) -> Result<()> {
    let mint_pubkey = Pubkey::from_str(mint).context("Invalid mint address")?;

    // Fetch the on-chain TokenMint account — no transaction needed, this is a read
    let mint_account: solana_token::TokenMint = program
        .account(mint_pubkey)
        .context("Failed to fetch mint account")?;

    println!("✓ Mint info");
    println!("  Mint address:  {}", mint_pubkey);
    println!("  Authority:     {}", mint_account.authority);
    println!("  Total supply:  {}", mint_account.total_supply);
    println!("  Decimals:      {}", mint_account.decimals);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_load_keypair_valid() {
        let keypair = Keypair::new();
        let keypair_bytes = keypair.to_bytes();
        let json = serde_json::to_string(&keypair_bytes.to_vec()).unwrap();

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(json.as_bytes()).unwrap();
        temp_file.flush().unwrap();

        let loaded = load_keypair(temp_file.path().to_str().unwrap()).unwrap();
        assert_eq!(loaded.pubkey(), keypair.pubkey());
    }

    #[test]
    fn test_load_keypair_invalid_path() {
        let result = load_keypair("/nonexistent/path/keypair.json");
        assert!(result.is_err());
    }
}
