import { loadConfig, readBidHistory } from '../store.js'

interface GetBidHistoryArgs {
  limit?: number
}

export async function handleGetBidHistory(args: GetBidHistoryArgs): Promise<object> {
  const rawLimit = args.limit ?? 20
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 20, 500))
  const config = await loadConfig()
  const records = await readBidHistory(limit, config.walletAddress)
  return {
    walletAddress: config.walletAddress,
    records,
    note: 'Only locally recorded bid submissions tagged with the current wallet are returned.',
  }
}
