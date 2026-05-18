import { getAuctionStatus } from '../bidder.js'
import { loadConfig } from '../store.js'

export async function getBidStatus(): Promise<object> {
  const config = await loadConfig()
  const status = await getAuctionStatus(config, config.kernelAddress)
  return status
}
