import { drainBidEvents } from '../bidder.js'

export function handleGetBidEvents(): object {
  const events = drainBidEvents()
  return {
    count: events.length,
    events,
    note: events.length === 0
      ? 'No new events since last check.'
      : 'Events drained — call again to check for newer activity.',
  }
}
