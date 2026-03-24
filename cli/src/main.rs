use anchor_client::{solana_sdk::commitment_config::CommitmentConfig, Client, Cluster};
use anyhow::Result;
use clap::{Parser, Subcommand};
use solana_token_cli::{balance, burn, create_account, init, load_keypair, mint_tokens, transfer, ID};
use std::rc::Rc;

#[derive(Parser)]
#[command(name = "solana-token-cli")]
#[command(about = "CLI for interacting with the Solana Token program", long_about = None)]
struct Cli {
    /// RPC URL for the Solana cluster
    #[arg(short, long, default_value = "http://localhost:8899")]
    rpc_url: String,

    /// Path to the payer keypair file
    #[arg(short, long, default_value = "~/.config/solana/id.json")]
    keypair: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize a new token mint
    Init {
        /// Number of decimal places for the token
        #[arg(short, long)]
        decimals: u8,

        /// Path to mint keypair (will generate new if not provided)
        #[arg(short, long)]
        mint_keypair: Option<String>,
    },
    /// Create a token account for a user
    CreateAccount {
        /// Address of the token mint
        #[arg(short, long)]
        mint: String,

        /// Owner of the token account (defaults to payer if not provided)
        #[arg(short, long)]
        owner: Option<String>,
    },
    /// Mint tokens to a token account
    Mint {
        /// Address of the token mint
        #[arg(short, long)]
        mint: String,

        /// Owner address to mint tokens to
        #[arg(short, long)]
        to: String,

        /// Amount of tokens to mint
        #[arg(short, long)]
        amount: u64,
    },
    /// Transfer tokens between accounts
    Transfer {
        /// Address of the token mint
        #[arg(short, long)]
        mint: String,

        /// Recipient owner address
        #[arg(short, long)]
        to: String,

        /// Amount of tokens to transfer
        #[arg(short, long)]
        amount: u64,
    },
    /// Burn tokens from a token account
    Burn {
        /// Address of the token mint
        #[arg(short, long)]
        mint: String,

        /// Amount of tokens to burn
        #[arg(short, long)]
        amount: u64,
    },
    /// Get token account balance
    Balance {
        /// Address of the token mint
        #[arg(short, long)]
        mint: String,

        /// Owner address (defaults to payer if not provided)
        #[arg(short, long)]
        owner: Option<String>,
    },
    /// Get mint information
    MintInfo {
        /// Address of the token mint
        #[arg(short, long)]
        mint: String,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    // Load payer keypair
    let payer = load_keypair(&cli.keypair)?;
    let payer = Rc::new(payer);

    // Create client and program
    let cluster = Cluster::Custom(cli.rpc_url.clone(), cli.rpc_url.clone());
    let client = Client::new_with_options(cluster, payer.clone(), CommitmentConfig::confirmed());
    let program = client.program(ID)?;

    match cli.command {
        Commands::Init {
            decimals,
            mint_keypair,
        } => {
            init(&program, &payer, decimals, mint_keypair)?;
        }
        Commands::CreateAccount { mint, owner } => {
            create_account(&program, &payer, &mint, owner.as_deref())?;
        }
        Commands::Mint { mint, to, amount } => {
            mint_tokens(&program, &payer, &mint, &to, amount)?;
        }
        Commands::Transfer { mint, to, amount } => {
            transfer(&program, &payer, &mint, &to, amount)?;
        }
        Commands::Burn { mint, amount } => {
            burn(&program, &payer, &mint, amount)?;
        }
        Commands::Balance { mint, owner } => {
            balance(&program, &payer, &mint, owner.as_deref())?;
        }
        Commands::MintInfo { mint } => {
            println!("TODO: implement mint-info command");
            println!("  mint: {}", mint);
        }
    }

    Ok(())
}
