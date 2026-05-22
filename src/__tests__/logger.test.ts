import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getTrackedMessageCountForTest,
  resetThrottledStderrStateForTest,
  throttledStderr,
} from '../logger.js'

describe('throttledStderr', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    resetThrottledStderrStateForTest()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('writes message on first call', () => {
    throttledStderr('hello world\n')
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    expect(stderrSpy).toHaveBeenCalledWith('hello world\n')
  })

  it('suppresses same message within cooldown', () => {
    throttledStderr('error: connection refused\n', 60_000)
    throttledStderr('error: connection refused\n', 60_000)
    throttledStderr('error: connection refused\n', 60_000)
    expect(stderrSpy).toHaveBeenCalledTimes(1)
  })

  it('allows same message after cooldown expires', () => {
    throttledStderr('retry message\n', 60_000)
    expect(stderrSpy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)

    throttledStderr('retry message\n', 60_000)
    expect(stderrSpy).toHaveBeenCalledTimes(2)
  })

  it('never suppresses different messages', () => {
    throttledStderr('message A\n', 60_000)
    throttledStderr('message B\n', 60_000)
    throttledStderr('message C\n', 60_000)
    expect(stderrSpy).toHaveBeenCalledTimes(3)
  })

  it('uses 60s default cooldown', () => {
    throttledStderr('default cooldown test\n')
    throttledStderr('default cooldown test\n')
    // Still suppressed at 59s
    vi.advanceTimersByTime(59_999)
    throttledStderr('default cooldown test\n')
    expect(stderrSpy).toHaveBeenCalledTimes(1)

    // Allowed at exactly 60s
    vi.advanceTimersByTime(1)
    throttledStderr('default cooldown test\n')
    expect(stderrSpy).toHaveBeenCalledTimes(2)
  })

  it('prunes expired tracked messages before adding new ones', () => {
    throttledStderr('message 1\n', 1_000)
    throttledStderr('message 2\n', 2_000)
    expect(getTrackedMessageCountForTest()).toBe(2)

    vi.advanceTimersByTime(1_500)

    throttledStderr('message 3\n', 1_000)
    expect(getTrackedMessageCountForTest()).toBe(2)
  })

  it('caps tracked messages to a fixed upper bound', () => {
    for (let i = 0; i < 300; i++) {
      throttledStderr(`unique message ${i}\n`, 60_000)
    }

    expect(getTrackedMessageCountForTest()).toBe(256)
    expect(stderrSpy).toHaveBeenCalledTimes(300)
  })
})
