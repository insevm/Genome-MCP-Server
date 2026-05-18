import { readBidHistory } from '../store.js'

interface GetBidHistoryArgs {
  limit?: number
}

export async function handleGetBidHistory(args: GetBidHistoryArgs): Promise<object> {
  const limit = Math.min(args.limit ?? 20, 500)
  const records = await readBidHistory(limit)
  return { records }
}
