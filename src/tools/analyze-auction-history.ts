import { createPublicClient, http, formatEther, parseAbiItem } from 'viem'
import { mainnet } from 'viem/chains'
import { loadConfig } from '../store.js'
import { GENOME_CONTRACT, BLOCK_PER_MINT } from '../config.js'
import { isInitialized } from '../bidder.js'

const BID_PLACED     = parseAbiItem('event BidPlaced(address indexed bidder, uint256 amount)')
const AUCTION_SETTLED = parseAbiItem('event AuctionSettled(uint256 indexed tokenId, address indexed winner, uint256 bidAmount)')

interface AnalyzeAuctionHistoryArgs {
  rounds?: number
}

interface RoundSummary {
  tokenId: number
  winner: string
  winningBid: string
  startBlock: number
  endBlock: number
  totalBids: number
  uniqueBidders: number
  bids: { bidder: string; amount: string; block: number; blocksBeforeEnd: number }[]
}

export async function handleAnalyzeAuctionHistory(args: AnalyzeAuctionHistoryArgs): Promise<object> {
  if (!isInitialized()) throw new Error('Bidder not initialized. GENOME_BID_PASSWORD env var not set?')

  const rounds = Math.min(args.rounds ?? 10, 20)
  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })

  const currentBlock = await client.getBlockNumber()
  // Add 2-round buffer to ensure enough settled events are captured
  const fromBlock = currentBlock - BigInt(rounds + 2) * BLOCK_PER_MINT

  const [settledLogs, bidLogs] = await Promise.all([
    client.getLogs({ address: GENOME_CONTRACT, event: AUCTION_SETTLED, fromBlock, toBlock: currentBlock }),
    client.getLogs({ address: GENOME_CONTRACT, event: BID_PLACED,      fromBlock, toBlock: currentBlock }),
  ])

  if (settledLogs.length === 0) {
    return { error: 'No completed auction rounds found in block range. Try increasing rounds.' }
  }

  const sortedSettled = [...settledLogs].sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber))

  // Take only the most recent N rounds
  const targetRounds = sortedSettled.slice(-rounds)

  const roundsData: RoundSummary[] = targetRounds.map((settled, idx, arr) => {
    const endBlock   = Number(settled.blockNumber)
    const prevBlock  = idx > 0 ? Number(arr[idx - 1].blockNumber) : endBlock - Number(BLOCK_PER_MINT)
    const startBlock = prevBlock + 1

    const roundBids = bidLogs
      .filter(l => Number(l.blockNumber) >= startBlock && Number(l.blockNumber) <= endBlock)
      .map(l => ({
        bidder:         l.args.bidder as string,
        amount:         formatEther(l.args.amount as bigint),
        block:          Number(l.blockNumber),
        blocksBeforeEnd: endBlock - Number(l.blockNumber),
      }))
      .sort((a, b) => a.block - b.block)

    return {
      tokenId:       Number(settled.args.tokenId),
      winner:        settled.args.winner as string,
      winningBid:    formatEther(settled.args.bidAmount as bigint),
      startBlock,
      endBlock,
      totalBids:     roundBids.length,
      uniqueBidders: new Set(roundBids.map(b => b.bidder)).size,
      bids:          roundBids,
    }
  })

  // Cross-round bidder stats
  const bidderStats: Record<string, { bids: number; wins: number; maxBidEth: number }> = {}
  for (const round of roundsData) {
    for (const bid of round.bids) {
      if (!bidderStats[bid.bidder]) bidderStats[bid.bidder] = { bids: 0, wins: 0, maxBidEth: 0 }
      bidderStats[bid.bidder].bids++
      const amt = parseFloat(bid.amount)
      if (amt > bidderStats[bid.bidder].maxBidEth) bidderStats[bid.bidder].maxBidEth = amt
    }
    if (!bidderStats[round.winner]) bidderStats[round.winner] = { bids: 0, wins: 0, maxBidEth: parseFloat(round.winningBid) }
    bidderStats[round.winner].wins++
  }

  const topBidders = Object.entries(bidderStats)
    .sort(([, a], [, b]) => b.bids - a.bids)
    .slice(0, 8)
    .map(([address, s]) => ({
      address,
      totalBids: s.bids,
      wins:      s.wins,
      winRate:   `${((s.wins / roundsData.length) * 100).toFixed(0)}%`,
      maxBid:    `${s.maxBidEth.toFixed(6)} ETH`,
    }))

  const winningBids   = roundsData.map(r => parseFloat(r.winningBid))
  const avgWinningBid = winningBids.reduce((a, b) => a + b, 0) / winningBids.length
  const avgBidsPerRound = roundsData.reduce((a, r) => a + r.totalBids, 0) / roundsData.length

  return {
    roundsAnalyzed: roundsData.length,
    blockRange: { from: Number(fromBlock), to: Number(currentBlock) },
    summary: {
      avgBidsPerRound:  avgBidsPerRound.toFixed(1),
      avgWinningBid:    `${avgWinningBid.toFixed(6)} ETH`,
      minWinningBid:    `${Math.min(...winningBids).toFixed(6)} ETH`,
      maxWinningBid:    `${Math.max(...winningBids).toFixed(6)} ETH`,
      topBidders,
    },
    rounds: [...roundsData].reverse(), // most recent first
  }
}
