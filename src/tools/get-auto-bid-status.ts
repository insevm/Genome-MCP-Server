import { getAutoBidState, isInitialized } from '../bidder.js'
import { loadConfig } from '../store.js'

export async function handleGetAutoBidStatus(): Promise<object> {
  const config = await loadConfig()

  return {
    initialized: isInitialized(),
    walletAddress: config.walletAddress,
    ...getAutoBidState(),
  }
}
