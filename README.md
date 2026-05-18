# Genome Auto-Bid MCP Server

> Repository: [github.com/insevm/Genome-MCP-Server](https://github.com/insevm/Genome-MCP-Server)

Let any MCP-compatible AI agent automatically bid on [Genome NFT](https://etherscan.io/address/0x852740fad3e6f5cd4b234311172db29004cceea7) auctions using natural language.

Funds stay in a ZeroDev Kernel smart account that only you control. The MCP server holds a single session key whose permissions are enforced on-chain — it cannot exceed your configured bid cap, call any other contract, or act after expiry.

---

## Table of Contents

- [AI Agent Auto-Install](#ai-agent-auto-install)
- [Manual Install](#manual-install)
- [Usage Examples](#usage-examples)
- [Security Model](#security-model)
- [FAQ](#faq)

---

## AI Agent Auto-Install

> Paste the prompt below into your AI agent and it will handle the full setup automatically.

```
Please help me install the Genome Auto-Bid MCP Server. Here is what needs to happen — figure out the right commands and paths for my system:

1. Clone https://github.com/insevm/Genome-MCP-Server.git to skill local directory and run `npm install` inside it.

2. Run the interactive setup wizard: `npx genome-bid-mcp setup`
   The wizard will ask for a ZeroDev Project ID (free at https://dashboard.zerodev.app), Ethereum mainnet HTTP and WebSocket RPC URLs, a max bid cap in ETH, session key validity in days, and an encryption password. It then opens a browser page — I will complete the MetaMask authorization step myself.

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

4. Tell me the Kernel account address printed by the wizard — I will send ETH to it.

5. Restart the agent after the config is saved.

If you hit any errors, share the exact message and I will help troubleshoot.
```

---

## Manual Install

### Prerequisites

| Requirement  | Details                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| Node.js      | 20 or later                                                                                  |
| MetaMask     | Installed in your browser                                                                    |
| Ethereum RPC | HTTP + WebSocket URLs from Alchemy or Infura                                                 |
| ZeroDev      | Free project at [dashboard.zerodev.app](https://dashboard.zerodev.app) — grab the Project ID |

### Step 1 — Install

```bash
# From npm (once published)
npm install -g genome-bid-mcp

# Or from source (installs into Claude skills directory)
mkdir -p ~/.claude/skills
git clone https://github.com/insevm/Genome-MCP-Server.git ~/.claude/skills/genome-bid-mcp
cd ~/.claude/skills/genome-bid-mcp
npm install
npm run build
```

### Step 2 — Initialize

```bash
npx genome-bid-mcp setup
```

The wizard prompts you for:

```
Enter your ZeroDev Project ID: abc123...
Enter your Ethereum mainnet HTTP RPC URL: https://eth-mainnet.g.alchemy.com/v2/xxx
Enter your Ethereum mainnet WebSocket RPC URL: wss://eth-mainnet.g.alchemy.com/v2/xxx
Max bid per session key (ETH) [default: 0.5]: 0.3
Session key validity (days) [default: 7]: 7
Set an encryption password for the session key: ••••••••
```

Then it opens `http://localhost:47382` in your browser:

1. Click **Connect MetaMask** — approve the connection request
2. Click **Authorize in MetaMask** — approve the EIP-712 signature, which grants the session key the following on-chain permissions:
   - May only call the Genome contract (`0x8527…ea7`)
   - May only call `bidAndMint()`
   - Value per transaction capped at your configured limit
   - Automatically expires after N days

When the browser step completes, the terminal prints:

```
✓ Setup complete!
  Kernel account : 0xDEF...GHI
  Session key    : 0xABC...
  Expires        : 2026-05-25T00:00:00.000Z

→ Fund your Kernel account by sending ETH to:
  0xDEF...GHI

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

### Step 3 — Fund the Kernel account

Send ETH to the Kernel account address from MetaMask. Start with a small amount to test.

### Step 4 — Configure your agent

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
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

### Run monitoring and snipe together

```
Start auto-bid on Genome (cap 0.3 ETH) and also snipe with up to 0.35 ETH at the end
```

### Withdraw ETH from Kernel account

```
Withdraw 0.1 ETH from my Genome Kernel account to 0xABC...
```

### Withdraw GENE tokens

```
Send all my GENE tokens to 0xABC...
```

### View bid history

```
Show my last 10 Genome bids
```

### Stop auto-bidding

```
Stop the Genome auto-bid
```

### Renew session key

```bash
npx genome-bid-mcp renew
```

---

## Security Model

```
Your main wallet (MetaMask)
    │  owner relationship
    ▼
Kernel smart account  (holds your bidding funds)
    │  on-chain policy — cannot be bypassed
    ▼
Session key  (~/.genome-bid/session.key, AES-GCM encrypted)
    │  MCP protocol
    ▼
Genome Auto-Bid MCP Server  (local process)
    │  UserOperation → ZeroDev Bundler
    ▼
Genome contract  (bidAndMint / transfer)
```

**Session key constraints enforced on-chain** (hardcoded in the Kernel contract, not bypassable):

- May only call the Genome contract
- May only call `bidAndMint()` and `transfer()` (for withdrawals)
- ETH value per transaction capped at the limit you set during setup
- Automatically expires after N days

**Local files:**

```
~/.genome-bid/
├── session.key    # AES-GCM encrypted — requires GENOME_BID_PASSWORD to decrypt
├── config.json    # Kernel address, RPC URLs, defaults (no secrets)
└── history.jsonl  # Bid history, one JSON record per line
```

---

## FAQ

**Q: What if I forget my password?**

Re-run `npx genome-bid-mcp setup` to generate a new session key and re-authorize. The old session key expires on-chain automatically — no extra cleanup needed.

**Q: How do I withdraw ETH or GENE from the Kernel account?**

Use the `withdraw_eth` or `withdraw_gene` MCP tools directly from your agent. The session key has on-chain permission to call `transfer()` and send ETH. For amounts exceeding the per-tx cap, split into multiple withdrawals.

**Q: Why do I need two RPC URLs (HTTP and WebSocket)?**

HTTP is used for sending transactions. WebSocket is used for real-time block monitoring, which is critical for precise snipe timing. If you only have HTTP, snipe still works but polls at a slightly higher latency.

**Q: Is the ZeroDev Project ID required?**

Yes. ZeroDev's bundler submits UserOperations on-chain. The free tier is sufficient for personal use.

**Q: Does snipe_bid require a Flashbots API key?**

No. `usePrivateMempool: true` (the default) uses `https://rpc.flashbots.net`, which requires no registration.

**Q: Does a new bid extend the auction deadline?**

No. The Genome contract fixes the deadline at `lastMintBlock + 104` blocks (~20 minutes per round on Ethereum mainnet). Bids do not extend the timer — this is precisely why the snipe strategy works.

---

## Local Data

| File                          | Contents                              |
| ----------------------------- | ------------------------------------- |
| `~/.genome-bid/session.key`   | AES-GCM encrypted session key         |
| `~/.genome-bid/config.json`   | Account config (no secrets)           |
| `~/.genome-bid/history.jsonl` | Bid history, one JSON record per line |
