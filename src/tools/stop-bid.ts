import { stopBidWatcher } from '../bidder.js'

export function handleStopBid(): { ok: boolean; message: string } {
  stopBidWatcher()
  return { ok: true, message: 'Bid watcher stopped.' }
}
