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

async function ensureDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
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
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 })
}

export async function loadConfig(): Promise<Config> {
  const raw = await fs.readFile(CONFIG_FILE, 'utf8')
  return JSON.parse(raw) as Config
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

export async function readBidHistory(limit: number): Promise<BidRecord[]> {
  try {
    const raw   = await fs.readFile(HISTORY_FILE, 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)
    return lines
      .slice(-limit)
      .map(l => JSON.parse(l) as BidRecord)
      .reverse()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    process.stderr.write(`[genome-bid-mcp] Failed to read bid history: ${(err as Error).message}\n`)
    return []
  }
}
