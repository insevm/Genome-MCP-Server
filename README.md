# Genome Skill

> Genome NFT project distilled into an AI skill — your agent understands the project deeply and can participate in on-chain auctions.

**Ethereum** · **21,000 NFT hard cap** · **21,000,000 GENE hard cap** · **~20 min auction cycle**

---

## What is Genome?

Genome is an NFT project on Ethereum mainnet. It hard-caps at **21,000 NFTs** with an embedded token called **GENE** (hard cap 21,000,000). The key design principle: the NFT and its tokens are a single unified asset — you cannot separate them. When you transfer the NFT, the GENE inside travels with it.

Each NFT displays **9 letters from the Phoenician alphabet** — one of the oldest writing systems and the ancestor of Hebrew, Arabic, and Greek. The letters are randomly assigned at mint and fixed forever, forming each NFT's unique "gene sequence." The artwork is generated entirely on-chain and lights up based on how much GENE is embedded inside — more GENE means more pixels lit, a brighter image.

---

## Economic Model

### Halving — Like Bitcoin

GENE tokens minted per NFT halve every 2,100 NFTs (one era):

| Era | NFTs | GENE per NFT | Cumulative Supply |
|-----|------|-------------|------------------|
| 0 | 1 – 2,100 | 5,000 | 10,500,000 |
| 1 | 2,101 – 4,200 | 2,500 | 15,750,000 |
| 2 | 4,201 – 6,300 | 1,250 | 18,375,000 |
| 3 | 6,301 – 8,400 | 625 | 19,687,500 |
| … | … | halves | … |
| 9 | 18,901 – 21,000 | ~9.8 | 21,000,000 |

Early NFTs hold significantly more GENE than later ones. Era 0 NFTs are the densest.

### Auction Proceeds

Every auction's winning bid is distributed as follows:

- **0.5%** → protocol fee
- **99.5%** → community treasury

**Era 0:** Every 69 mints, the treasury automatically pairs ETH + GENE as Uniswap V3 liquidity — bootstrapping the initial GENE market.

**Era 1+:** Every 3 mints, the treasury uses accumulated ETH to buy GENE back from the open market. Buyback tokens accumulate in the treasury for future community governance.

Auction proceeds continuously support GENE's market liquidity and price floor.

### Auction Mechanics

- New NFT goes up for auction every **~20 minutes** (104 Ethereum blocks)
- Minimum bid: **0.0001 ETH**
- Fixed deadline — bids do **not** extend the timer
- When outbid, your ETH is returned immediately
- The **transfer** function enforces a **10 NFT per wallet** limit — but winning auctions can push a wallet above this cap

---

## On-Chain Addresses

| Contract | Address |
|----------|---------|
| Genome (NFT + GENE) | [`0x852740fad3e6f5cd4b234311172db29004cceea7`](https://etherscan.io/address/0x852740fad3e6f5cd4b234311172db29004cceea7) |
| Chain | Ethereum Mainnet (chainId 1) |

---

## Knowledge Base — What Your Agent Knows

This skill includes a built-in knowledge base (`docs/genome-project.md`). Add it to your agent and ask anything in natural language — no need to read the contract.

### Project Basics

```
What is Genome?
How many NFTs will ever exist?
What is GENE and how is it different from a normal ERC-20?
Can a single wallet hold unlimited NFTs?
```

### Auction Mechanics

```
How does the Genome auction work?
What happens if someone outbids me?
Does a new bid extend the auction deadline?
What is the minimum bid to enter?
```

### Economic Model

```
Explain the halving schedule
Where does the auction ETH go?
How does the community treasury work?
How is the GENE market liquidity established?
When does the buyback mechanism kick in?
```

### NFT Artwork

```
What do the letters on a Genome NFT represent?
Why does the NFT image change over time?
Is the artwork stored on-chain?
Which letter is the rarest?
What makes an NFT brighter or dimmer?
```

### Balances & Transfers

```
How is my total GENE balance calculated?
Can I send GENE tokens without transferring the NFT?
What happens when I send an NFT to a DeFi contract?
What if a recipient already holds 10 NFTs?
```

---

## MCP Extension — Bidding & Trading Tools

Beyond answering questions, this skill ships an **MCP server** that lets your agent take on-chain actions: monitor auctions, place bids, snipe in the final seconds, swap GENE on Uniswap, and manage the bidding wallet.

### Available Tools

| Tool | What it does |
|------|-------------|
| `get_bid_status` | Live auction snapshot: top bid, blocks remaining, current winner |
| `place_bid` | Submit a single bid at an exact ETH amount |
| `start_bid` | Unified watcher: enters at minimum price if no competition, snipes with aggressive gas if a competitor appears |
| `stop_bid` | Stop the active bid watcher |
| `get_bid_watcher_status` | Inspect watcher state, transport mode, trigger progress, last decision |
| `get_bid_events` | Drain all unread bid events (placed, exceeded limit, errors) |
| `get_bid_history` | Recent bid submissions recorded locally |
| `get_wallet_info` | ETH balance, GENE balance, default settings |
| `get_floor_price` | Estimate break-even bid price from embedded GENE value |
| `analyze_auction_history` | Per-round stats and leaderboard for recent auctions |
| `analyze_bidder` | Profile a competitor's bidding behavior and timing pattern |
| `swap_gene` | Buy or sell GENE on Uniswap V3 (ETH ↔ GENE) |
| `withdraw_eth` | Send ETH from the bidding wallet to any address |
| `withdraw_gene` | Send GENE tokens from the bidding wallet |

### Sample Agent Prompts

```
What is the current Genome auction status?
Watch the auction and bid up to 0.3 ETH — enter at min price if no one is bidding, snipe if there's competition
Analyze the last 10 auction rounds and show snipe-window gas stats
Profile this bidder: 0xABC...
Buy GENE with 0.1 ETH on Uniswap
Estimate the current Genome floor price
```

### Install the MCP Server

#### Let your agent install it

Copy the prompt below and send it to your AI agent — it will handle the full setup:

```
Please install the Genome Skill MCP server from https://github.com/insevm/Genome-MCP-Server

Steps to follow:
1. Clone the repo into a suitable local directory, then run: npm install && npm run build
2. Ask me for: an Ethereum mainnet HTTP RPC URL (required, e.g. from Alchemy or Infura) and an optional WebSocket RPC URL (leave blank to skip)
3. Ask me to set an encryption password for the wallet key (I need to remember this — it is required every time the MCP server starts)
4. Run: node dist/index.js setup — enter the RPC URL, WebSocket URL, and password when prompted; record the wallet address it prints
5. Register the MCP server in my agent config with GENOME_RPC_HTTP_URL, GENOME_RPC_WS_URL (optional), and GENOME_BID_PASSWORD in the env block
6. Tell me the wallet address so I can send ETH to fund bidding
7. Restart the agent to load the new config
```

#### Manual install

**Prerequisites:** Node.js 20+, Ethereum mainnet RPC (HTTP required, WebSocket recommended for snipe precision)

```bash
git clone https://github.com/insevm/Genome-MCP-Server.git
cd Genome-MCP-Server
npm install && npm run build
node dist/index.js setup
```

The wizard asks for your RPC URL, max bid, and an encryption password, then prints a wallet address and a ready-to-paste agent config snippet. Fund the wallet with ETH and restart your agent.

For full details and security model → see [DEVELOPMENT.md](./DEVELOPMENT.md)

---

## Security

The wallet key never leaves your machine. It is encrypted at rest with AES-GCM using a key derived from your password. Only fund the bidding wallet with what you are willing to use for bidding and swaps.

```
Your password  →  Encrypted key (~/.genome-bid/session.key)  →  MCP Server (local)  →  Ethereum
```

---

*Built on [Model Context Protocol](https://modelcontextprotocol.io). Compatible with Claude Desktop, Cursor, and any MCP-compatible agent.*
