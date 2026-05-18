import * as readline from 'readline'
import { generateWalletKey, getWalletAddress } from './wallet.js'
import { saveSessionKey, saveConfig } from './store.js'
import { GENOME_CONTRACT } from './config.js'
import type { Config } from './types.js'

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

  const rpcHttpUrl =
    process.env.RPC_HTTP_URL ??
    (await prompt('Enter your Ethereum mainnet HTTP RPC URL (Alchemy/Infura): '))

  const rpcWsUrlRaw =
    process.env.RPC_WS_URL ??
    (await prompt('Enter your Ethereum mainnet WebSocket RPC URL (leave blank to skip): '))
  const rpcWsUrl = rpcWsUrlRaw || undefined

  const maxEth = (await prompt('Default max bid per auction (ETH) [default: 0.5]: ')) || '0.5'
  const password = await promptPassword('Set an encryption password for the wallet key: ')

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
      incrementEth: '0.0001',
      leadBlocks: 2,
      gasStrategy: 'normal',
      snipe: {
        triggerBlocks: 1,
        gasPriorityMultiplier: 5.0,
        usePrivateMempool: true,
      },
    },
  }

  await saveConfig(config)

  out('\n✓ Setup complete!')
  out(`  Wallet address : ${walletAddress}`)
  out('\n→ Fund your wallet by sending ETH to:')
  out(`  ${walletAddress}`)
  out('\n→ Add to your agent config:')
  out(`{
  "mcpServers": {
    "genome-bid": {
      "command": "npx",
      "args": ["genome-bid-mcp"],
      "env": {
        "GENOME_BID_PASSWORD": "<your-password>"
      }
    }
  }
}`)
}
