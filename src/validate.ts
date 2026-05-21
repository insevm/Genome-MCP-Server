import { isAddress } from 'viem'

export function validateAddress(value: string, fieldName: string): void {
  if (!isAddress(value)) {
    throw new Error(`${fieldName} must be a valid Ethereum address (0x…), got: "${value}"`)
  }
}

export function validatePositiveDecimal(value: string, fieldName: string): void {
  if (value === 'all') return
  if (!/^\d+(\.\d{0,18})?$/.test(value) || Number(value) <= 0) {
    throw new Error(`${fieldName} must be a positive decimal number (e.g. "0.1"), got: "${value}"`)
  }
}

export function clampRounds(value: unknown, defaultVal: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : defaultVal
  return Math.min(Math.max(Math.floor(n), 1), max)
}

// Scrubs RPC URLs (which embed API keys) from error messages before they
// reach the MCP stdio transport. Walks the error cause chain.
export function sanitizeRpcError(err: unknown, rpcUrl: string): string {
  const parts: string[] = []
  let current: unknown = err
  while (current instanceof Error) {
    // Take only the first line — viem appends URL/body/docs after a blank line
    const firstLine = current.message.split('\n')[0].trim()
    // Skip duplicate adjacent messages (viem retries produce identical cause chains)
    if (firstLine && firstLine !== parts[parts.length - 1]) parts.push(firstLine)
    current = (current as NodeJS.ErrnoException & { cause?: unknown }).cause
  }
  if (typeof current === 'string') {
    parts.push(current)
  } else if (current !== null && current !== undefined) {
    // Non-Error objects: CloseEvent / ErrorEvent have non-enumerable properties that JSON.stringify misses.
    // Probe known WS event fields explicitly before falling back.
    const obj = current as Record<string, unknown>
    const tag = (current as object).constructor?.name
    const detail = [
      typeof obj.message === 'string' && obj.message ? obj.message : null,
      typeof obj.code    !== 'undefined'              ? `code=${String(obj.code)}`     : null,
      typeof obj.reason  === 'string' && obj.reason   ? `reason=${obj.reason}`         : null,
      typeof obj.type    === 'string' && obj.type     ? `type=${obj.type}`             : null,
      tag && tag !== 'Object'                         ? `(${tag})`                     : null,
    ].filter((x): x is string => x !== null).join(' ')

    if (detail) {
      parts.push(detail)
    } else {
      try {
        const json = JSON.stringify(current)
        parts.push(json !== '{}' ? json : `[object ${tag ?? 'unknown'}]`)
      } catch {
        parts.push(String(current))
      }
    }
  }
  const raw = parts.join(' | ')
  const withLiteral = rpcUrl ? raw.replaceAll(rpcUrl, '<rpc-url>') : raw
  return withLiteral
    .replace(/wss?:\/\/[^\s"']*/g, '<rpc-url>')
    .replace(/https?:\/\/[^\s"']*/g, '<rpc-url>')
}
