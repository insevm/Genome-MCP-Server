# Genome Auto-Bid MCP Server

> Repository: [github.com/insevm/Genome-MCP-Server](https://github.com/insevm/Genome-MCP-Server)

Let any MCP-compatible AI agent automatically bid on [Genome NFT](https://etherscan.io/address/0x852740fad3e6f5cd4b234311172db29004cceea7) auctions, swap GENE tokens, and manage your bidding wallet — all in natural language.

The MCP server holds an encrypted wallet key on your machine. It can only be unlocked with your password and never leaves your device.

---

## Table of Contents

- [AI Agent Auto-Install](#ai-agent-auto-install)
- [Manual Install](#manual-install)
- [Usage Examples](#usage-examples)
- [Ask About Genome](#ask-about-genome)
- [Security Model](#security-model)
- [FAQ](#faq)

---

## AI Agent Auto-Install

> Paste the prompt below into your AI agent and it will handle the full setup automatically.

```
Please help me install the Genome Auto-Bid MCP Server. Here is what needs to happen — figure out the right commands and paths for my system:

1. Clone https://github.com/insevm/Genome-MCP-Server.git into your agent's skills directory and run `npm install` inside it.

2. Run the interactive setup wizard: `npx genome-bid-mcp setup`
   The wizard will ask for an Ethereum mainnet HTTP RPC URL, an optional WebSocket RPC URL, a default max bid in ETH, and an encryption password. It will then print a wallet address.

3. The wizard prints an MCP server config snippet when it finishes. Register it in my agent's MCP config so the server starts automatically. The snippet looks like:
   {
     "mcpServers": {
       "genome-bid": {
         "command": "npx",
         "args": ["genome-bid-mcp"],
         "env": { "GENOME_BID_PASSWORD": "<my password>" }
       }
     }
   }

4. Tell me the wallet address printed by the wizard — I will send ETH to it to fund bidding.

5. Restart the agent after the config is saved.

If you hit any errors, share the exact message and I will help troubleshoot.
```

---

## Manual Install

### Prerequisites

| Requirement  | Details |
| ------------ | ------- |
| Node.js      | 20 or later |
| Ethereum RPC | HTTP URL from Alchemy, Infura, or any mainnet provider. WebSocket is optional but improves snipe precision. |

### Step 1 — Install

```bash
# From npm (once published)
npm install -g genome-bid-mcp

# Or from source
git clone https://github.com/insevm/Genome-MCP-Server.git genome-bid-mcp
cd genome-bid-mcp
npm install
npm run build
```

### Step 2 — Initialize

```bash
npx genome-bid-mcp setup
```

The wizard prompts you for:

```
Enter your Ethereum mainnet HTTP RPC URL (Alchemy/Infura): https://eth-mainnet.g.alchemy.com/v2/xxx
Enter your Ethereum mainnet WebSocket RPC URL (leave blank to skip): wss://eth-mainnet.g.alchemy.com/v2/xxx
Default max bid per auction (ETH) [default: 0.5]: 0.3
Set an encryption password for the wallet key: ••••••••
```

When setup finishes, the terminal prints:

```
✓ Setup complete!
  Wallet address : 0xABC...DEF

→ Fund your wallet by sending ETH to:
  0xABC...DEF

→ Add to your agent config:
{
  "mcpServers": {
    "genome-bid": {
      "command": "npx",
      "args": ["genome-bid-mcp"],
      "env": {
        "GENOME_BID_PASSWORD": "your_password"
      }
    }
  }
}
```

### Step 3 — Fund the wallet

Send ETH to the wallet address printed above. This ETH is used for bids, gas fees, and Uniswap swaps. Start with a small amount to test.

### Step 4 — Configure your agent

Add the config snippet to your agent's MCP config file. For Claude Desktop, edit `~/Library/Application Support/Claude/claude_desktop_config.json`.

When running from source, change `command` to `node` and `args` to `["/path/to/genome-bid-mcp/dist/index.js"]`.

Restart the agent to pick up the new config.

### Step 5 — Verify

Ask your agent:

```
Check my Genome bidding account status with get_wallet_info
```

---

## Usage Examples

### Check current auction state

```
What is the current Genome auction status?
```

### Place a one-time bid

```
Bid on Genome for me, up to 0.3 ETH max
```

### Start continuous monitoring

```
Watch the Genome auction and automatically outbid anyone who beats me, cap at 0.3 ETH
```

### Snipe at end of auction

```
Snipe the Genome auction in the final seconds, up to 0.35 ETH
```

> Snipe mode fires in the last block before the deadline (~12 seconds on Ethereum), using 5× priority fee and Flashbots Protect to prevent MEV frontrunning.

### Inspect snipe watcher status

```
Show my current Genome snipe status
```

### Estimate current floor price

```
Estimate the current Genome floor price before I bid
```

> This is a spot estimate based on the current Uniswap quote for selling the embedded GENE in the next NFT. It does not include gas, slippage drift, or future price movement.

### Run monitoring and snipe together

```
Start auto-bid on Genome (cap 0.3 ETH) and also snipe with up to 0.35 ETH at the end
```

### Analyze recent auction history

```
Analyze the last 10 Genome auction rounds
```

### Profile a competitor

```
Analyze how 0xABC... has been bidding in recent Genome auctions
```

### Buy GENE on Uniswap

```
Buy GENE with 0.1 ETH
Buy exactly 500 GENE for me
```

### Sell GENE on Uniswap

```
Sell 200 GENE for ETH
Sell enough GENE to get 0.05 ETH
```

### Withdraw ETH from bidding wallet

```
Withdraw 0.1 ETH from my Genome wallet to 0xABC...
```

### Withdraw GENE tokens

```
Send all my GENE tokens to 0xABC...
```

### View local bid submission history

```
Show the recent bid submissions this Genome server has recorded for me
```

### Stop auto-bidding

```
Stop the Genome auto-bid
```

---

## Ask About Genome

Your agent has a built-in knowledge base about the Genome project (`docs/genome-project.md`). You can ask questions in plain language — no need to read the contract code yourself.

**Project basics**

```
What is Genome?
How many NFTs will ever exist?
What is GENE?
```

**Auction mechanics**

```
How does the Genome auction work?
What happens if someone outbids me?
Does a new bid extend the auction timer?
What is the minimum bid?
```

**Token economics**

```
What is the halving schedule?
Where does the auction money go?
How does the community treasury work?
```

**NFT artwork**

```
What do the letters on a Genome NFT mean?
Why does the NFT image change over time?
Is the artwork stored on-chain?
What is the rarest letter?
```

**Balances and transfers**

```
How is my GENE balance calculated?
What happens if I send GENE to someone who already has 10 NFTs?
Can I send GENE without transferring the NFT?
```

---

## Security Model

```
Your encryption password  (only you know this)
    │
    ▼
Wallet key  (~/.genome-bid/session.key, AES-GCM encrypted)
    │  MCP protocol (stdio, local process)
    ▼
Genome Auto-Bid MCP Server
    │  signed transactions → Ethereum RPC
    ▼
Genome contract / Uniswap V3
```

**The wallet key never leaves your machine.** It is encrypted at rest with AES-GCM using a key derived from your password. The MCP server decrypts it in memory at startup and uses it to sign transactions locally.

**Isolation by funding:** Only send to the bidding wallet what you are willing to use for bidding and swaps. This limits exposure if the wallet key is ever compromised.

**Local files:**

```
~/.genome-bid/
├── session.key    # AES-GCM encrypted — requires GENOME_BID_PASSWORD to decrypt
├── config.json    # Wallet address and strategy defaults (no secrets)
├── rpc.json       # RPC URLs, stored separately because they may contain API keys
└── history.jsonl  # Local bid submission history written by this MCP server, tagged by wallet
```

---

## FAQ

**Q: What if I forget my password?**

Re-run `npx genome-bid-mcp setup` to generate a new wallet key. Transfer any remaining funds from the old wallet address first.

**Q: How do I withdraw ETH or GENE from the bidding wallet?**

Use the `withdraw_eth` or `withdraw_gene` MCP tools directly from your agent.

**Q: Why do I need two RPC URLs (HTTP and WebSocket)?**

HTTP is used for sending transactions. WebSocket enables real-time block monitoring for precise snipe timing. If you only have HTTP, snipe works but polls at slightly higher latency.

**Q: Does snipe_bid require a Flashbots API key?**

No. `usePrivateMempool: true` (the default) uses `https://rpc.flashbots.net`, which requires no registration.

**Q: Does a new bid extend the auction deadline?**

No. The Genome contract fixes the deadline at `lastMintBlock + 104` blocks (~20 minutes per round on Ethereum mainnet). Bids do not extend the timer — this is precisely why the snipe strategy works.

**Q: How does the swap_gene tool handle slippage?**

It quotes the current price from Uniswap's on-chain QuoterV2 contract before every swap, then applies your configured slippage tolerance (default 0.5%) to set the minimum output or maximum input. The transaction reverts on-chain if the price moves beyond that tolerance.

**Q: What exactly does get_bid_history show?**

It shows the recent bid submissions recorded locally by this MCP server in `~/.genome-bid/history.jsonl` and tagged with the current wallet address. It is not a full on-chain bidding history, it does not currently backfill whether each bid eventually won or was outbid, and older history lines written before wallet tagging are ignored.

**Q: Is get_floor_price a guaranteed risk-free floor?**

No. It is a spot estimate based on the current Uniswap quote for selling the embedded GENE in the next NFT. Real recovery can differ because of gas costs, slippage, and price movement after you win.

---

## Local Data

| File | Contents |
| ---- | -------- |
| `~/.genome-bid/session.key` | AES-GCM encrypted wallet key |
| `~/.genome-bid/config.json` | Wallet address and strategy defaults (no secrets) |
| `~/.genome-bid/rpc.json` | RPC URLs, stored separately because they may contain API keys |
| `~/.genome-bid/history.jsonl` | Local bid submission history tagged by wallet, one JSON record per line |
