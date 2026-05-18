# Genome Project — Knowledge Base

Use this document to answer user questions about the Genome / $GENE project in plain language. Avoid jargon; explain concepts the way you would to someone who understands crypto basics but has not read the contract code.

---

## What is Genome?

Genome is an NFT project on Ethereum. It has a hard cap of **21,000 NFTs** and a token called **GENE** with a hard cap of **21,000,000**.

Each NFT carries GENE tokens inside it — the NFT and the tokens are one unified asset. You cannot separate the NFT from its tokens the way you would in a typical NFT + ERC-20 setup. When you transfer the NFT, the tokens move with it. When you send GENE as a token, the contract automatically includes NFTs if needed to cover the amount.

---

## How Bidding Works

A new NFT goes up for auction roughly **every 20 minutes** (every 104 Ethereum blocks). The auction is a simple highest-bid-wins format:

- Anyone can place a bid. The minimum is **0.0001 ETH**.
- Each new bid must be higher than the current top bid.
- When someone outbids you, your ETH is returned to you immediately.
- The auction does **not** extend when a new bid arrives — the deadline is fixed. This is why end-of-auction sniping is a viable strategy.
- After the 20-minute window closes, the next person to call the contract claims the NFT for the previous highest bidder and starts the next round.

---

## Halving — Like Bitcoin

Genome borrows the halving concept from Bitcoin. The GENE tokens minted per NFT halve with each era (called an epoch):

| Era | GENE per NFT |
|-----|-------------|
| 0 (first 2,100 NFTs) | 5,000 GENE |
| 1 (next 2,100 NFTs)  | 2,500 GENE |
| 2 | 1,250 GENE |
| 3 | 625 GENE |
| … | halves each era |

Early NFTs hold significantly more GENE than later ones. There are 10 eras in total before the supply cap is reached.

---

## Where the Auction Money Goes

- **0.5%** goes to the protocol as a fee.
- **99.5%** goes into a community treasury contract.

**During Era 0:** Every 69 mints, the treasury automatically adds ETH and GENE as liquidity to a Uniswap trading pool — this establishes the initial market for GENE.

**From Era 1 onward:** Every 3 mints, the treasury automatically uses the accumulated ETH to buy GENE back from the market. These purchased tokens accumulate in the treasury for future community use.

This design means auction proceeds continuously support GENE's market liquidity and price.

---

## The NFT Artwork

Each Genome NFT displays 9 letters from the **Phoenician alphabet** — one of the oldest writing systems, the ancestor of Hebrew, Arabic, and Greek. The 9 letters are chosen randomly at the moment of minting and are permanently fixed — they form the NFT's unique "gene sequence."

The letters are not just decoration. They light up based on how many GENE tokens are stored inside the NFT. More GENE inside = more pixels lit = brighter, fuller artwork. As GENE moves in or out, the image changes in real time. The image is generated entirely on-chain — no external servers, no IPFS.

Each letter has a different pixel count, so the same amount of GENE looks different depending on which letters your NFT received at mint. The rarest and most pixel-rich letter is **Daleth (𐤃)**, and the lightest is **Tsadi (𐤑)**.

---

## Address Limit

A single wallet address can hold a maximum of **10 NFTs**. If a transfer would push a wallet over 10 NFTs, only the GENE tokens inside those NFTs are received — the NFTs themselves are not transferred (their GENE is zeroed and credited to the recipient as liquid tokens instead).

This limit applies to receiving transfers. You can hold up to 10 NFTs; additional transfers credit the token value only.

---

## GENE Token Balance

Your total GENE balance has two parts:
1. **Liquid GENE** — tokens sitting in your wallet, not inside any NFT.
2. **NFT-embedded GENE** — tokens locked inside each NFT you own.

The `balanceOf` function returns the combined total. When you send GENE as a token, the contract uses your liquid GENE first. If that is not enough, it automatically pulls from your NFTs (and transfers those NFTs along with the tokens).

---

## Common Questions

**Can I bid without owning any GENE?**
Yes. Bidding requires only ETH. You receive GENE inside the NFT when you win.

**Does placing a new bid extend the auction?**
No. The deadline is fixed when the auction round begins. Bidding does not add time.

**What happens if I am outbid?**
Your ETH is returned to your wallet immediately when someone places a higher bid.

**What is the minimum bid?**
0.0001 ETH.

**How often does a new NFT go up for auction?**
Approximately every 20 minutes (104 Ethereum blocks). Block times can vary slightly.

**Are there fees?**
0.5% of the winning bid goes to the protocol. The rest goes to the community treasury.

**Can I sell my NFT?**
Yes, Genome NFTs are standard ERC-721 tokens and can be listed on any NFT marketplace that supports Ethereum.

**Can I send just the GENE tokens without the NFT?**
Yes. If you have liquid GENE (tokens not embedded in an NFT), you can transfer those directly. If you only have NFT-embedded GENE, transferring the tokens will also transfer the NFT.

**Is the artwork stored on-chain?**
Yes. The SVG image is generated entirely by the contract with no external dependencies. It will be accessible as long as Ethereum exists.

**What happens to GENE if I send my NFT to a DeFi contract (like a liquidity pool)?**
DeFi contracts are special: when an NFT's GENE would flow into them, the NFT is burned and only the GENE value is credited. This prevents empty NFTs from piling up in contracts.

**What does the gene sequence mean?**
The 9 Phoenician letters shown on your NFT are randomly assigned at mint and never change. They determine the NFT's visual structure and maximum brightness. They may also carry significance in future Genome ecosystem applications.

**How many NFTs will ever exist?**
Hard cap: 21,000 NFTs. Hard cap on GENE tokens: 21,000,000.
