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

export async function runSetup(mode: 'setup' | 'renew'): Promise<void> {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║     Genome Auto-Bid MCP — Setup          ║')
  console.log('╚══════════════════════════════════════════╝\n')

  const rpcHttpUrl =
    process.env.RPC_HTTP_URL ??
    (await prompt('Enter your Ethereum mainnet HTTP RPC URL (Alchemy/Infura): '))

  const rpcWsUrl =
    process.env.RPC_WS_URL ??
    (await prompt('Enter your Ethereum mainnet WebSocket RPC URL (leave blank to skip): '))

  const maxEth = (await prompt('Default max bid per auction (ETH) [default: 0.5]: ')) || '0.5'
  const password = await prompt('Set an encryption password for the wallet key: ')

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

  console.log('\n✓ Setup complete!')
  console.log(`  Wallet address : ${walletAddress}`)
  console.log('\n→ Fund your wallet by sending ETH to:')
  console.log(`  ${walletAddress}`)
  console.log('\n→ Add to your agent config:')
  console.log(`
{
  "mcpServers": {
    "genome-bid": {
      "command": "npx",
      "args": ["genome-bid-mcp"],
      "env": {
        "GENOME_BID_PASSWORD": "${password}"
      }
    }
  }
}`)
}
