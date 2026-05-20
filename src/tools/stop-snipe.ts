import { getSnipeState, stopSnipe } from '../bidder.js'

export function handleStopSnipe(): object {
  const before = getSnipeState()
  stopSnipe()

  return {
    status: before.watching ? 'stopped' : 'not-watching',
    wasWatching: before.watching,
    previousStatus: before.status,
    previousDecision: before.lastDecision,
    previousStopReason: before.stopReason,
  }
}
