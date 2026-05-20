import { stopAutoBid } from '../bidder.js'

export function handleStopAutoBid(): object {
  const { wasRunning, lastAction, session } = stopAutoBid()
  return {
    status: wasRunning ? 'stopped' : 'not-running',
    lastAction,
    session,
  }
}
