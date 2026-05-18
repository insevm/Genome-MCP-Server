import { getAuctionStatus } from '../bidder.js'
import { loadConfig } from '../store.js'

export async function getBidStatus(): Promise<object> {
  const config = await loadConfig()
  return getAuctionStatus(config, config.walletAddress)
}
