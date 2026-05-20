import { getBidWatcherState } from '../bidder.js'
import type { BidWatcherSnapshot } from '../types.js'

export function handleGetBidWatcher(): BidWatcherSnapshot {
  return getBidWatcherState()
}
