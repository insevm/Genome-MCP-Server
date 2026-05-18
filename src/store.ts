import { gcm } from '@noble/ciphers/aes'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { sha256 } from '@noble/hashes/sha256'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Config, BidRecord } from './types.js'

const STORAGE_DIR = join(homedir(), '.genome-bid')
const SESSION_KEY_FILE = join(STORAGE_DIR, 'session.key')
const CONFIG_FILE = join(STORAGE_DIR, 'config.json')
export const HISTORY_FILE = join(STORAGE_DIR, 'history.jsonl')

async function ensureDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
}

function deriveKey(password: string): Uint8Array {
  return sha256(new TextEncoder().encode(password))
}

export async function saveSessionKey(privateKey: string, password: string): Promise<void> {
  await ensureDir()
  const key = deriveKey(password)
  const nonce = randomBytes(12)
  const cipher = gcm(key, nonce)
  const data = new TextEncoder().encode(privateKey)
  const encrypted = cipher.encrypt(data)

  const payload = new Uint8Array(12 + encrypted.length)
  payload.set(nonce, 0)
  payload.set(encrypted, 12)

  await fs.writeFile(SESSION_KEY_FILE, Buffer.from(payload).toString('base64'), 'utf8')
}

export async function loadSessionKey(password: string): Promise<string> {
  const raw = await fs.readFile(SESSION_KEY_FILE, 'utf8')
  const payload = Buffer.from(raw.trim(), 'base64')

  const nonce = payload.subarray(0, 12)
  const encrypted = payload.subarray(12)

  const key = deriveKey(password)
  const cipher = gcm(key, nonce)
  const decrypted = cipher.decrypt(encrypted)

  return new TextDecoder().decode(decrypted)
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureDir()
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
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
    const raw = await fs.readFile(HISTORY_FILE, 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)
    return lines
      .slice(-limit)
      .map(l => JSON.parse(l) as BidRecord)
      .reverse()
  } catch {
    return []
  }
}
