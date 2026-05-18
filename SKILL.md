# Genome Auto-Bid Skill

This skill lets you automatically bid on [Genome NFT](https://etherscan.io/address/0x852740fad3e6f5cd4b234311172db29004cceea7) auctions on Ethereum mainnet using natural language. Funds stay in a ZeroDev Kernel smart account that only you control. The server holds a single session key whose permissions are enforced on-chain — it cannot exceed your configured bid cap, call any other contract, or act after expiry.

## Prerequisites

Before this skill can be used, the following one-time setup must be completed:

1. **Node.js 20+** installed on the user's machine
2. **MetaMask** installed in the user's browser
3. **ZeroDev Project ID** — free at [dashboard.zerodev.app](https://dashboard.zerodev.app)
4. **Ethereum mainnet RPC URLs** — one HTTP and one WebSocket (Alchemy or Infura)
5. **The setup wizard must have been run** and a `~/.genome-bid/` directory must exist

## First-Time Setup

If `~/.genome-bid/config.json` does not exist, run the interactive setup wizard:

```bash
npx genome-bid-mcp setup
```

The wizard will ask for:
- ZeroDev Project ID
- Ethereum mainnet HTTP RPC URL (e.g. `https://eth-mainnet.g.alchemy.com/v2/xxx`)
- Ethereum mainnet WebSocket RPC URL (e.g. `wss://eth-mainnet.g.alchemy.com/v2/xxx`)
- Maximum bid cap per transaction (ETH)
- Session key validity in days
- An encryption password to protect the local session key

The wizard opens a browser page where the user connects MetaMask and signs an EIP-712 message to authorize the session key on-chain. At the end, it prints the Kernel account address. **Send ETH to that address before placing bids.**

## Configuration

The MCP server requires the environment variable `GENOME_BID_PASSWORD` — the password chosen during setup. This is used to decrypt the local session key (`~/.genome-bid/session.key`).

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

The skill.json in this directory declares the same server for agents that support the skills directory install pattern.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_bid_status` | Get current auction state: top bid, winner, blocks remaining, whether your Kernel account is winning |
| `start_auto_bid` | Start a background monitor that re-bids whenever you are outbid, up to a configured ETH cap |
| `stop_auto_bid` | Stop the background monitor |
| `snipe_bid` | Fire a single bid in the final blocks before the auction deadline with aggressive gas and Flashbots private mempool |
| `get_bid_history` | List recent bids placed by your Kernel account |
| `get_wallet_info` | Show Kernel account ETH balance and session key status (expiry, address) |
| `withdraw_eth` | Withdraw native ETH from the Kernel account to any address |
| `withdraw_gene` | Transfer GENE tokens from the Kernel account to any address |

## Example Prompts

```
What is the current Genome auction status?

Bid on Genome for me, up to 0.3 ETH

Watch the Genome auction and automatically outbid anyone who beats me, cap at 0.3 ETH

Snipe the Genome auction in the final seconds, up to 0.35 ETH

Withdraw 0.1 ETH from my Genome Kernel account to 0xABC...

Send all my GENE tokens to 0xABC...

Show my last 10 Genome bids
```

## Session Key Renewal

Session keys expire after the number of days configured at setup. To renew:

```bash
npx genome-bid-mcp renew
```

This runs the same browser authorization flow and replaces the stored key.

## Security Model

```
Your main wallet (MetaMask)
    │  owner relationship
    ▼
Kernel smart account  (holds your bidding funds)
    │  on-chain policy — cannot be bypassed
    ▼
Session key  (~/.genome-bid/session.key, AES-GCM encrypted)
    │  MCP protocol (stdio)
    ▼
Genome Auto-Bid MCP Server  (local process on your machine)
    │  UserOperation → ZeroDev Bundler
    ▼
Genome contract  (bidAndMint / transfer)
```

On-chain constraints (enforced by the Kernel contract, not bypassable):
- May only call the Genome contract (`0x852740fad3e6f5cd4b234311172db29004cceea7`)
- May only call `bidAndMint()` and `transfer()`
- ETH value per transaction capped at the limit set during setup
- Automatically expires after N days

The session key never leaves your machine. All transaction signing happens locally.
