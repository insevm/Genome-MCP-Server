const DEFAULT_COOLDOWN_MS = 60_000
const MAX_TRACKED_MESSAGES = 256

/** Tracks the last time each unique message was written to stderr. */
const nextAllowedAtByMessage = new Map<string, number>()

function pruneExpiredMessages(now: number): void {
  for (const [message, nextAllowedAt] of nextAllowedAtByMessage) {
    if (nextAllowedAt <= now) nextAllowedAtByMessage.delete(message)
  }
}

function capTrackedMessages(): void {
  while (nextAllowedAtByMessage.size > MAX_TRACKED_MESSAGES) {
    const oldest = nextAllowedAtByMessage.keys().next()
    if (oldest.done) return
    nextAllowedAtByMessage.delete(oldest.value)
  }
}

/**
 * Write `msg` to stderr, suppressing repeated identical messages within `cooldownMs`.
 * Different messages are never suppressed by each other.
 */
export function throttledStderr(msg: string, cooldownMs: number = DEFAULT_COOLDOWN_MS): void {
  const now = Date.now()
  const effectiveCooldownMs = Math.max(0, cooldownMs)

  pruneExpiredMessages(now)

  const nextAllowedAt = nextAllowedAtByMessage.get(msg)

  if (nextAllowedAt !== undefined && now < nextAllowedAt) {
    return
  }

  nextAllowedAtByMessage.delete(msg)
  nextAllowedAtByMessage.set(msg, now + effectiveCooldownMs)
  capTrackedMessages()
  process.stderr.write(msg)
}

// Test helpers.
export function resetThrottledStderrStateForTest(): void {
  nextAllowedAtByMessage.clear()
}

export function getTrackedMessageCountForTest(): number {
  return nextAllowedAtByMessage.size
}
