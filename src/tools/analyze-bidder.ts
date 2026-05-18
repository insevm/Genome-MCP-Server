import { createPublicClient, http, formatEther, parseAbiItem } from 'viem'
import { mainnet } from 'viem/chains'
import { loadConfig } from '../store.js'
import { GENOME_CONTRACT, BLOCK_PER_MINT } from '../config.js'
import { isInitialized } from '../bidder.js'
import { validateAddress } from '../validate.js'

const BID_PLACED      = parseAbiItem('event BidPlaced(address indexed bidder, uint256 amount)')
const AUCTION_SETTLED = parseAbiItem('event AuctionSettled(uint256 indexed tokenId, address indexed winner, uint256 bidAmount)')

interface AnalyzeBidderArgs {
  address: string
  rounds?: number
}

interface ParticipatedRound {
  tokenId: number
  bids: { amountEth: number; blocksBeforeEnd: number }[]
  won: boolean
  roundWinningBidEth: number
}

export async function handleAnalyzeBidder(args: AnalyzeBidderArgs): Promise<object> {
  if (!isInitialized()) throw new Error('Bidder not initialized. GENOME_BID_PASSWORD env var not set?')

  validateAddress(args.address, 'address')

  const rounds = Math.min(args.rounds ?? 20, 50)
  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })

  const currentBlock = await client.getBlockNumber()
  const fromBlock    = currentBlock - BigInt(rounds + 2) * BLOCK_PER_MINT

  // Filter BidPlaced by bidder (indexed), fetch all settled events for round reconstruction
  const [bidLogs, settledLogs] = await Promise.all([
    client.getLogs({
      address: GENOME_CONTRACT,
      event:   BID_PLACED,
      args:    { bidder: args.address as `0x${string}` },
      fromBlock,
      toBlock: currentBlock,
    }),
    client.getLogs({
      address: GENOME_CONTRACT,
      event:   AUCTION_SETTLED,
      fromBlock,
      toBlock: currentBlock,
    }),
  ])

  if (bidLogs.length === 0) {
    return {
      address: args.address,
      roundsParticipated: 0,
      roundsWon: 0,
      winRate: '0%',
      note: `No bids found for ${args.address} in the last ${rounds} rounds.`,
    }
  }

  // Reconstruct round boundaries from settled events
  const sortedSettled = [...settledLogs].sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber))

  const participatedRounds: ParticipatedRound[] = []

  for (let i = 0; i < sortedSettled.length; i++) {
    const settled    = sortedSettled[i]
    const endBlock   = Number(settled.blockNumber)
    const prevBlock  = i > 0 ? Number(sortedSettled[i - 1].blockNumber) : endBlock - Number(BLOCK_PER_MINT)
    const startBlock = prevBlock + 1

    const roundBids = bidLogs.filter(
      l => Number(l.blockNumber) >= startBlock && Number(l.blockNumber) <= endBlock,
    )

    if (roundBids.length > 0) {
      participatedRounds.push({
        tokenId: Number(settled.args.tokenId),
        bids: roundBids.map(l => ({
          amountEth:      parseFloat(formatEther(l.args.amount as bigint)),
          blocksBeforeEnd: endBlock - Number(l.blockNumber),
        })),
        won: (settled.args.winner as string).toLowerCase() === args.address.toLowerCase(),
        roundWinningBidEth: parseFloat(formatEther(settled.args.bidAmount as bigint)),
      })
    }
  }

  if (participatedRounds.length === 0) {
    return {
      address: args.address,
      roundsParticipated: 0,
      roundsWon: 0,
      winRate: '0%',
      note: 'Bids found but could not map to completed auction rounds.',
    }
  }

  const wonRounds  = participatedRounds.filter(r => r.won)
  const allBids    = participatedRounds.flatMap(r => r.bids)
  const allAmounts = allBids.map(b => b.amountEth)
  const allOffsets = allBids.map(b => b.blocksBeforeEnd)

  const highestBid = Math.max(...allAmounts)
  const avgBid     = allAmounts.reduce((a, b) => a + b, 0) / allAmounts.length
  const avgOffset  = allOffsets.reduce((a, b) => a + b, 0) / allOffsets.length
  const sortedOffsets = [...allOffsets].sort((a, b) => a - b)
  const medianOffset  = sortedOffsets[Math.floor(sortedOffsets.length / 2)]

  // Bid increment analysis: within each round, how much does the address raise?
  const increments: number[] = []
  for (const round of participatedRounds) {
    const sorted = [...round.bids].sort((a, b) => a.blocksBeforeEnd - b.blocksBeforeEnd).reverse()
    for (let i = 1; i < sorted.length; i++) {
      const inc = sorted[i].amountEth - sorted[i - 1].amountEth
      if (inc > 0) increments.push(inc)
    }
  }

  // Timing pattern classification
  const sniperBids = allBids.filter(b => b.blocksBeforeEnd <= 3).length
  const earlyBids  = allBids.filter(b => b.blocksBeforeEnd > 50).length
  const timingPattern =
    sniperBids / allBids.length >= 0.5 ? 'sniper — majority of bids in last 3 blocks' :
    earlyBids  / allBids.length >= 0.5 ? 'early bidder — bids mostly 50+ blocks before end' :
    'mid-round — bids spread throughout the auction'

  return {
    address: args.address,
    roundsParticipated: participatedRounds.length,
    roundsWon: wonRounds.length,
    winRate:   `${((wonRounds.length / participatedRounds.length) * 100).toFixed(0)}%`,
    highestBid: `${highestBid.toFixed(6)} ETH`,
    avgBid:     `${avgBid.toFixed(6)} ETH`,
    bidTiming: {
      avgBlocksBeforeEnd:    Math.round(avgOffset),
      medianBlocksBeforeEnd: medianOffset,
      pattern:               timingPattern,
      sniperBidPct:         `${((sniperBids / allBids.length) * 100).toFixed(0)}%`,
    },
    bidIncrements: increments.length > 0
      ? {
          min: `${Math.min(...increments).toFixed(6)} ETH`,
          max: `${Math.max(...increments).toFixed(6)} ETH`,
          avg: `${(increments.reduce((a, b) => a + b, 0) / increments.length).toFixed(6)} ETH`,
        }
      : null,
    recentRounds: [...participatedRounds]
      .sort((a, b) => b.tokenId - a.tokenId)
      .slice(0, 5)
      .map(r => ({
        tokenId:              r.tokenId,
        bidsPlaced:           r.bids.length,
        highestBid:           `${Math.max(...r.bids.map(b => b.amountEth)).toFixed(6)} ETH`,
        lastBidBlocksBeforeEnd: Math.min(...r.bids.map(b => b.blocksBeforeEnd)),
        won:                  r.won,
        roundWinningBid:      `${r.roundWinningBidEth.toFixed(6)} ETH`,
      })),
  }
}
