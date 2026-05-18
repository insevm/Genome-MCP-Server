import { stopAutoBid } from '../bidder.js'

export function handleStopAutoBid(): object {
  const lastAction = stopAutoBid()
  return { status: 'stopped', lastAction }
}
