import { gcm } from '@noble/ciphers/aes'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { scrypt } from '@noble/hashes/scrypt'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Config, BidRecord } from './types.js'

const STORAGE_DIR = join(homedir(), '.genome-bid')
const SESSION_KEY_FILE = join(STORAGE_DIR, 'session.key')
const CONFIG_FILE = join(STORAGE_DIR, 'config.json')
export const HISTORY_FILE = join(STORAGE_DIR, 'history.jsonl')

const SALT_LEN  = 16
const NONCE_LEN = 12

// Module-level RPC config — set once at startup via setRpcConfig(), never persisted.
let _rpcHttpUrl: string | undefined
let _rpcWsUrl: string | undefined

function assertHttpUrl(value: string, name: string): void {
  if (!/^https?:\/\/.+/.test(value)) {
    throw new Error(`${name} must be an http:// or https:// URL.`)
  }
}

function assertWsUrl(value: string, name: string): void {
  if (!/^wss?:\/\/.+/.test(value)) {
    throw new Error(`${name} must be a ws:// or wss:// URL.`)
  }
}

export function setRpcConfig(httpUrl: string, wsUrl?: string): void {
  assertHttpUrl(httpUrl, 'GENOME_RPC_HTTP_URL')
  if (wsUrl) assertWsUrl(wsUrl, 'GENOME_RPC_WS_URL')
  _rpcHttpUrl = httpUrl
  _rpcWsUrl = wsUrl
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 })
}

// scrypt with recommended interactive parameters (N=2^17 ≈ 1 s on commodity hardware)
function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  return scrypt(new TextEncoder().encode(password), salt, {
    N: 2 ** 17, r: 8, p: 1, dkLen: 32,
  })
}

// File format: [16-byte salt][12-byte nonce][AES-GCM ciphertext], base64-encoded
export async function saveSessionKey(privateKey: string, password: string): Promise<void> {
  await ensureDir()
  const salt  = randomBytes(SALT_LEN)
  const nonce = randomBytes(NONCE_LEN)
  const key   = deriveKey(password, salt)
  const encrypted = gcm(key, nonce).encrypt(new TextEncoder().encode(privateKey))

  const payload = new Uint8Array(SALT_LEN + NONCE_LEN + encrypted.length)
  payload.set(salt,      0)
  payload.set(nonce,     SALT_LEN)
  payload.set(encrypted, SALT_LEN + NONCE_LEN)

  await fs.writeFile(
    SESSION_KEY_FILE,
    Buffer.from(payload).toString('base64'),
    { encoding: 'utf8', mode: 0o600 },
  )
  await fs.chmod(SESSION_KEY_FILE, 0o600)
}

export async function loadSessionKey(password: string): Promise<string> {
  const raw     = await fs.readFile(SESSION_KEY_FILE, 'utf8')
  const payload = Buffer.from(raw.trim(), 'base64')

  if (payload.length < SALT_LEN + NONCE_LEN + 1) {
    throw new Error(
      'Wallet key file format is outdated. Re-run `npx genome-bid-mcp setup` to generate a new key.',
    )
  }

  const salt      = payload.subarray(0, SALT_LEN)
  const nonce     = payload.subarray(SALT_LEN, SALT_LEN + NONCE_LEN)
  const encrypted = payload.subarray(SALT_LEN + NONCE_LEN)
  const key       = deriveKey(password, salt)

  try {
    const decrypted = gcm(key, nonce).decrypt(encrypted)
    return new TextDecoder().decode(decrypted)
  } catch {
    throw new Error(
      'Failed to decrypt wallet key — wrong password, or key file is outdated. Re-run setup if needed.',
    )
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureDir()
  // RPC URLs embed API keys — not persisted; provided via GENOME_RPC_HTTP_URL env var at runtime.
  const { rpcHttpUrl: _rpcHttpUrl, rpcWsUrl: _rpcWsUrl, ...walletConfig } = config
  await fs.writeFile(CONFIG_FILE, JSON.stringify(walletConfig, null, 2), { encoding: 'utf8', mode: 0o600 })
  await fs.chmod(CONFIG_FILE, 0o600)
}

export async function loadConfig(): Promise<Config> {
  const raw = await fs.readFile(CONFIG_FILE, 'utf8').catch(() => {
    throw new Error('Config missing. Run: npx genome-bid-mcp setup')
  })
  const config = JSON.parse(raw)

  if (!config.walletAddress || !config.defaults) {
    throw new Error('Config is incomplete or corrupted. Re-run `npx genome-bid-mcp setup`.')
  }

  if (!_rpcHttpUrl) {
    throw new Error('RPC not initialized. Ensure GENOME_RPC_HTTP_URL is set and the server is restarted.')
  }

  return { ...config, rpcHttpUrl: _rpcHttpUrl, rpcWsUrl: _rpcWsUrl } as Config
}

export async function configExists(): Promise<boolean> {
  try {
    await fs.access(CONFIG_FILE)
    return true
  } catch {
    return false
  }
}

export async function appendBidRecord(record: BidRecord): Promise<void> {
  await ensureDir()
  await fs.appendFile(HISTORY_FILE, JSON.stringify(record) + '\n', 'utf8')
}

export async function updateBidResults(updates: Record<string, 'won' | 'outbid'>): Promise<void> {
  if (Object.keys(updates).length === 0) return
  let raw = ''
  try {
    raw = await fs.readFile(HISTORY_FILE, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    return
  }
  const lines = raw.trim().split('\n').filter(Boolean)
  const rewritten = lines.map(line => {
    try {
      const record = JSON.parse(line) as BidRecord
      if (record.txHash && updates[record.txHash]) {
        return JSON.stringify({ ...record, result: updates[record.txHash] })
      }
    } catch { /* skip malformed lines */ }
    return line
  })
  await fs.writeFile(HISTORY_FILE, rewritten.join('\n') + '\n', 'utf8')
}

export async function readBidHistory(limit: number, walletAddress: string): Promise<BidRecord[]> {
  try {
    const raw   = await fs.readFile(HISTORY_FILE, 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as Partial<BidRecord>
        } catch {
          return null
        }
      })
      .filter((record): record is BidRecord => {
        return record !== null
          && typeof record.walletAddress === 'string'
          && typeof record.timestamp === 'string'
          && typeof record.txHash === 'string'
          && typeof record.bidEth === 'string'
          && typeof record.tokenId === 'number'
          && (record.result === 'won' || record.result === 'outbid' || record.result === 'pending')
          && record.walletAddress.toLowerCase() === walletAddress.toLowerCase()
      })
      .slice(-limit)
      .reverse()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    process.stderr.write(`[genome-bid-mcp] Failed to read bid history: ${(err as Error).message}\n`)
    return []
  }
}
