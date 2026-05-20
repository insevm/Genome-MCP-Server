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
    parts.push(current.message)
    current = (current as NodeJS.ErrnoException & { cause?: unknown }).cause
  }
  if (typeof current === 'string') {
    parts.push(current)
  } else if (current !== null && current !== undefined) {
    // Non-Error, non-string tail — covers WS error events and Error cause chains ending in objects
    try { parts.push(JSON.stringify(current)) } catch { parts.push(String(current)) }
  }
  const raw = parts.join(' | ')
  const withLiteral = rpcUrl ? raw.replaceAll(rpcUrl, '<rpc-url>') : raw
  return withLiteral
    .replace(/wss?:\/\/[^\s"']*/g, '<rpc-url>')
    .replace(/https?:\/\/[^\s"']*/g, '<rpc-url>')
}
