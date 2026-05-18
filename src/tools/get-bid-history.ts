import { readBidHistory } from '../store.js'

interface GetBidHistoryArgs {
  limit?: number
}

export async function handleGetBidHistory(args: GetBidHistoryArgs): Promise<object> {
  const limit = args.limit ?? 20
  const records = await readBidHistory(limit)
  return { records }
}
