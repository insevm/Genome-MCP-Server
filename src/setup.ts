import * as readline from 'readline'
import * as fs from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { generateWalletKey, getWalletAddress } from './wallet.js'
import { saveSessionKey, saveConfig } from './store.js'
import { GENOME_CONTRACT } from './config.js'
import { validatePositiveDecimal } from './validate.js'
import type { Config } from './types.js'

const SESSION_KEY_FILE = join(homedir(), '.genome-bid', 'session.key')
const CONFIG_FILE = join(homedir(), '.genome-bid', 'config.json')

async function fileExists(path: string): Promise<boolean> {
  try { await fs.access(path); return true } catch { return false }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function promptPassword(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stderr.write(question)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    let password = ''
    const cleanup = (exitCode?: number) => {
      try { process.stdin.setRawMode(false) } catch { /* ignore */ }
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
      process.stderr.write('\n')
      if (exitCode !== undefined) process.exit(exitCode)
    }

    const onData = (char: string) => {
      try {
        if (char === '\r' || char === '\n') {
          cleanup()
          resolve(password)
        } else if (char === '') {
          // Ctrl+C
          cleanup(1)
        } else if (char === '' || char === '') {
          // Backspace / Delete
          if (password.length > 0) {
            password = password.slice(0, -1)
            process.stderr.write('\b \b')
          }
        } else {
          password += char
          process.stderr.write('*')
        }
      } catch (err) {
        cleanup()
        reject(err)
      }
    }
    process.stdin.on('data', onData)
  })
}

export async function runSetup(mode: 'setup' | 'renew'): Promise<void> {
  const out = (s: string) => process.stderr.write(s + '\n')

  out('\n╔══════════════════════════════════════════╗')
  out('║     Genome Auto-Bid MCP — Setup          ║')
  out('╚══════════════════════════════════════════╝\n')

  if (mode === 'setup' && await fileExists(SESSION_KEY_FILE) && await fileExists(CONFIG_FILE)) {
    out('ERROR: A wallet is already configured.')
    out('  To replace it, run:  node dist/index.js renew')
    out('  WARNING: renew generates a new private key — back up the old one first.')
    process.exit(1)
  }

  if (mode === 'renew') {
    let existingWallet = '(unknown)'
    try {
      const raw = await fs.readFile(CONFIG_FILE, 'utf8')
      const cfg = JSON.parse(raw)
      if (cfg.walletAddress) existingWallet = cfg.walletAddress
    } catch { /* ignore */ }

    out('⚠️  WARNING: renew will generate a NEW private key.')
    out(`   Current wallet : ${existingWallet}`)
    out('   Any ETH in this wallet will become INACCESSIBLE unless you have a backup.')
    out('')
    const confirm = await prompt('Type  yes I understand  to continue (anything else aborts): ')
    if (confirm !== 'yes I understand') {
      out('Aborted.')
      process.exit(1)
    }
    out('')
  }

  const rpcHttpUrl =
    process.env.GENOME_RPC_HTTP_URL ??
    (await prompt('Enter your Ethereum mainnet HTTP RPC URL (Alchemy/Infura): '))

  const rpcWsUrlRaw =
    process.env.GENOME_RPC_WS_URL ??
    (await prompt('Enter your Ethereum mainnet WebSocket RPC URL (leave blank to skip): '))
  const rpcWsUrl = rpcWsUrlRaw || undefined

  const maxEth =
    process.env.GENOME_BID_MAX_ETH ??
    ((await prompt('Default max bid per auction (ETH) [default: 0.5]: ')) || '0.5')

  try {
    validatePositiveDecimal(maxEth, 'GENOME_BID_MAX_ETH / maxEth')
  } catch (err) {
    out(`Invalid maxEth value: ${(err as Error).message}. Aborting setup.`)
    process.exit(1)
  }

  let password: string
  const envPassword = process.env.GENOME_BID_PASSWORD
  if (envPassword !== undefined && envPassword.length > 0) {
    if (envPassword.length < 12) {
      out('GENOME_BID_PASSWORD must be at least 12 characters. Aborting setup.')
      process.exit(1)
    }
    password = envPassword
    out('Using GENOME_BID_PASSWORD from environment (non-interactive mode).')
  } else {
    password = await promptPassword('Set an encryption password for the wallet key: ')
    const passwordConfirm = await promptPassword('Confirm encryption password: ')
    if (password !== passwordConfirm) {
      out('Passwords do not match. Aborting setup.')
      process.exit(1)
    }
  }

  const privateKey = generateWalletKey()
  const walletAddress = getWalletAddress(privateKey)

  await saveSessionKey(privateKey, password)

  const config: Config = {
    walletAddress,
    genomeContract: GENOME_CONTRACT,
    chainId: 1,
    rpcWsUrl,
    rpcHttpUrl,
    defaults: {
      maxEth,
      bid: {
        triggerBlocks: 1,
        gasPriorityMultiplier: 5.0,
        usePrivateMempool: false,
      },
    },
  }

  try {
    await saveConfig(config)
  } catch (err) {
    // Config write failed — remove the orphaned session.key so next `setup` run
    // is not incorrectly blocked by a half-finished state.
    await fs.unlink(SESSION_KEY_FILE).catch(() => {})
    throw err
  }

  out('\n✓ Setup complete!')
  out(`  Wallet address : ${walletAddress}`)
  out('\n→ Fund your wallet by sending ETH to:')
  out(`  ${walletAddress}`)
  out('\n→ Add to your agent config (fill in your actual RPC URLs and password):')
  out(`{
  "mcpServers": {
    "genome-bid": {
      "command": "npx",
      "args": ["genome-bid-mcp"],
      "env": {
        "GENOME_BID_PASSWORD": "<your-password>",
        "GENOME_RPC_HTTP_URL": "<your-http-rpc-url>",
        "GENOME_RPC_WS_URL": "<your-ws-rpc-url-or-leave-empty>"
      }
    }
  }
}`)
}
