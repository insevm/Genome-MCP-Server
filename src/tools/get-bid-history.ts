import { createPublicClient, http, parseAbiItem } from 'viem'
import { mainnet } from 'viem/chains'
import { loadConfig, readBidHistory, updateBidResults } from '../store.js'
import { GENOME_CONTRACT, BLOCK_PER_MINT } from '../config.js'
import type { BidRecord } from '../types.js'

const AUCTION_SETTLED = parseAbiItem('event AuctionSettled(uint256 indexed tokenId, address indexed winner, uint256 bidAmount)')

interface GetBidHistoryArgs {
  limit?: number
}

async function reconcilePending(
  pending: BidRecord[],
  walletAddress: string,
  rpcHttpUrl: string,
): Promise<Record<string, 'won' | 'outbid'>> {
  const client = createPublicClient({ chain: mainnet, transport: http(rpcHttpUrl) })
  const currentBlock = await client.getBlockNumber()

  // Use earliest stored blockNumber as fromBlock; fall back to estimated range
  const minKnownBlock = pending.reduce<number | undefined>((min, r) => {
    if (typeof r.blockNumber !== 'number') return min
    return min === undefined || r.blockNumber < min ? r.blockNumber : min
  }, undefined)
  const fallbackFrom = Number(currentBlock) - pending.length * Number(BLOCK_PER_MINT) - 200
  const fromBlock = BigInt(minKnownBlock ?? Math.max(0, fallbackFrom))

  const settledLogs = await client.getLogs({
    address: GENOME_CONTRACT,
    event:   AUCTION_SETTLED,
    fromBlock,
    toBlock: currentBlock,
  })

  const pendingByTokenId = new Map(pending.map(r => [r.tokenId, r]))
  const updates: Record<string, 'won' | 'outbid'> = {}

  for (const log of settledLogs) {
    const tokenId = Number(log.args.tokenId)
    const record  = pendingByTokenId.get(tokenId)
    if (!record) continue
    const winner = typeof log.args.winner === 'string' ? log.args.winner.toLowerCase() : ''
    updates[record.txHash] = winner === walletAddress.toLowerCase() ? 'won' : 'outbid'
  }

  return updates
}

export async function handleGetBidHistory(args: GetBidHistoryArgs): Promise<object> {
  const rawLimit = args.limit ?? 20
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 20, 500))
  const config = await loadConfig()
  let records = await readBidHistory(limit, config.walletAddress)

  const pending = records.filter(r => r.result === 'pending')
  let reconciled = 0

  if (pending.length > 0) {
    try {
      const updates = await reconcilePending(pending, config.walletAddress, config.rpcHttpUrl)
      if (Object.keys(updates).length > 0) {
        await updateBidResults(updates)
        records = records.map(r => updates[r.txHash] ? { ...r, result: updates[r.txHash] } : r)
        reconciled = Object.keys(updates).length
      }
    } catch {
      // Reconciliation is best-effort — don't fail the whole request
    }
  }

  return {
    walletAddress: config.walletAddress,
    records,
    pendingReconciled: reconciled,
    note: 'Only locally recorded bid submissions tagged with the current wallet are returned. Pending records are automatically resolved against on-chain settlement events.',
  }
}
