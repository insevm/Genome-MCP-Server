# Genome Auto-Bid Skill

This skill lets you automatically bid on [Genome NFT](https://etherscan.io/address/0x852740fad3e6f5cd4b234311172db29004cceea7) auctions, buy and sell GENE tokens on Uniswap, and manage a dedicated bidding wallet — all on Ethereum mainnet, all in natural language.

The MCP server holds an encrypted wallet key on the user's machine. It signs transactions locally and never sends the key anywhere.

## Prerequisites

Before this skill can be used, the following one-time setup must be completed:

1. **Node.js 20+** installed on the user's machine
2. **Ethereum mainnet RPC URL** — HTTP endpoint from Alchemy, Infura, or any provider. WebSocket is optional but improves snipe precision.
3. **The setup wizard must have been run** and a `~/.genome-bid/` directory must exist

## First-Time Setup

If `~/.genome-bid/config.json` does not exist, run the interactive setup wizard:

```bash
npx genome-bid-mcp setup
```

The wizard will ask for:
- Ethereum mainnet HTTP RPC URL
- Ethereum mainnet WebSocket RPC URL (optional)
- Default maximum bid per auction (ETH)
- An encryption password to protect the wallet key

At the end it prints a wallet address. **The user must send ETH to that address before placing bids or swaps.**

## Configuration

The MCP server requires the environment variable `GENOME_BID_PASSWORD` — the password chosen during setup. This is used to decrypt the wallet key (`~/.genome-bid/session.key`) at startup.

When registering this skill in your agent config, set:

```json
{
  "mcpServers": {
    "genome-bid": {
      "command": "npx",
      "args": ["genome-bid-mcp"],
      "env": {
        "GENOME_BID_PASSWORD": "<your-password>"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_bid_status` | Get current auction state: top bid, winner, blocks remaining, whether your wallet is winning |
| `start_auto_bid` | Start a background monitor that re-bids whenever you are outbid, up to a configured ETH cap |
| `stop_auto_bid` | Stop the background monitor |
| `snipe_bid` | Fire a single bid in the final blocks before the auction deadline with aggressive gas and Flashbots private mempool |
| `get_snipe_status` | Inspect the current snipe watcher state, including config, trigger progress, and any stop or error reason |
| `get_bid_history` | List recent local bid submissions tagged with the current wallet address; does not backfill full on-chain history or final outcomes |
| `get_wallet_info` | Show wallet ETH balance, GENE balance, and default bid settings |
| `get_floor_price` | Estimate the current spot break-even bid for the next auction based on the embedded GENE and a live Uniswap quote; excludes gas and future price movement |
| `analyze_auction_history` | Analyze recent completed auction rounds to see bid timing, winning prices, and the most active bidders |
| `analyze_bidder` | Profile a specific address's bidding style, win rate, bid timing, and increment behavior |
| `withdraw_eth` | Withdraw native ETH from the wallet to any address |
| `withdraw_gene` | Transfer GENE tokens from the wallet to any address |
| `swap_gene` | Buy or sell GENE on Uniswap V3 (ETH/GENE 0.3% pool). Supports exact ETH input, exact GENE input, exact ETH output, and exact GENE output. |

## Example Prompts

```
What is the current Genome auction status?

Bid on Genome for me, up to 0.3 ETH

Watch the Genome auction and automatically outbid anyone who beats me, cap at 0.3 ETH

Snipe the Genome auction in the final seconds, up to 0.35 ETH

Estimate the current Genome floor price before I bid

Analyze the last 10 Genome auction rounds

Analyze how 0xABC... has been bidding in recent Genome auctions

Buy GENE with 0.1 ETH
Buy exactly 500 GENE for me

Sell 200 GENE for ETH
Sell enough GENE to get 0.05 ETH

Show the recent bid submissions this Genome server has recorded for me

Withdraw 0.1 ETH from my Genome wallet to 0xABC...
Send all my GENE tokens to 0xABC...
```

## Answering Questions About the Genome Project

Beyond placing bids, you can answer user questions about how Genome works. Refer to `docs/genome-project.md` in this repository for full context. Key topics you can explain:

- How the auction works and what happens when someone outbids you
- The halving schedule and why early NFTs hold more GENE
- Where auction proceeds go (community treasury, Uniswap liquidity, buybacks)
- The Phoenician letter artwork and how it changes with GENE balance
- The 10-NFT-per-address limit and what happens when it is exceeded
- How to read your GENE balance (liquid vs. NFT-embedded)
- Whether the artwork is stored on-chain (yes, fully)
- Total supply caps (21,000 NFTs, 21,000,000 GENE)

When answering, use plain language. Avoid terms like "ERC-20", "ERC-721", "contract call", "balancesOfFT", "TWAP" — describe the behavior in terms of what the user sees and experiences.

---

## Security Model

```
Your encryption password  (only you know this)
    │
    ▼
Wallet key  (~/.genome-bid/session.key, AES-GCM encrypted)
    │  MCP protocol (stdio, local process)
    ▼
Genome Auto-Bid MCP Server  (runs on the user's machine)
    │  signed transactions → Ethereum RPC
    ▼
Genome contract / Uniswap V3
```

The wallet key never leaves the user's machine. All transaction signing happens locally. Only send to the bidding wallet what the user is willing to use for bidding and swaps.
