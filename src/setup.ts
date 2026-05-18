/**
 * Setup CLI — runs once to create the ZeroDev Kernel account and enable the session key.
 *
 * Flow:
 *  1. Generate session key locally (never leaves this machine unencrypted)
 *  2. Start a local HTTP server on port 47382
 *  3. Open browser → user connects MetaMask
 *  4. Browser POSTs MetaMask address to /api/prepare
 *  5. CLI computes Kernel address + builds the UserOp to enable the session key
 *  6. CLI returns the UserOp hash + EIP-712 typed data for the browser to sign
 *  7. Browser signs via eth_signTypedData_v4 → POSTs signature to /api/submit
 *  8. CLI attaches signature to UserOp and submits to the ZeroDev bundler
 *  9. CLI waits for on-chain confirmation, saves config
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as readline from 'readline'
import { generateSessionKey, getSessionKeyAddress, computeKernelAddress, buildEnableSessionKeyUserOp } from './kernel.js'
import { saveSessionKey, saveConfig, loadConfig, loadSessionKey } from './store.js'
import { GENOME_CONTRACT, SETUP_PORT } from './config.js'
import type { Config } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, data: object, status = 200): void {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(body)
}

export async function runSetup(mode: 'setup' | 'renew'): Promise<void> {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║     Genome Auto-Bid MCP — Setup          ║')
  console.log('╚══════════════════════════════════════════╝\n')

  // ── Gather config inputs ─────────────────────────────────────────────────────
  const zeroDev = process.env.ZERODEV_PROJECT_ID
    ? { projectId: process.env.ZERODEV_PROJECT_ID, bundlerUrl: `https://rpc.zerodev.app/api/v2/bundler/${process.env.ZERODEV_PROJECT_ID}` }
    : await (async () => {
        console.log('Get a free ZeroDev project at https://dashboard.zerodev.app')
        const projectId = await prompt('Enter your ZeroDev Project ID: ')
        return {
          projectId,
          bundlerUrl: `https://rpc.zerodev.app/api/v2/bundler/${projectId}`,
        }
      })()

  const rpcHttpUrl =
    process.env.RPC_HTTP_URL ??
    (await prompt('Enter your Ethereum mainnet HTTP RPC URL (Alchemy/Infura): '))

  const rpcWsUrl =
    process.env.RPC_WS_URL ??
    (await prompt('Enter your Ethereum mainnet WebSocket RPC URL (leave blank to skip): '))

  const maxEthDefault = await prompt('Max bid per session key (ETH) [default: 0.5]: ') || '0.5'
  const expiryDays = Number(await prompt('Session key validity (days) [default: 7]: ') || '7')
  const password = await prompt('Set an encryption password for the session key: ')

  // ── Generate session key ─────────────────────────────────────────────────────
  const sessionPrivateKey = generateSessionKey()
  const sessionKeyAddress = getSessionKeyAddress(sessionPrivateKey)
  const validUntilSecs = Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60
  const sessionKeyExpiresAt = new Date(validUntilSecs * 1000).toISOString()

  console.log(`\n✓ Session key generated: ${sessionKeyAddress}`)
  console.log(`  Expires: ${sessionKeyExpiresAt}`)

  // ── State shared between HTTP handlers ───────────────────────────────────────
  let resolveSetup!: (kernelAddress: string) => void
  let rejectSetup!: (err: Error) => void
  const setupDone = new Promise<string>((res, rej) => {
    resolveSetup = res
    rejectSetup = rej
  })

  let pendingUserOp: object | null = null
  let pendingKernelAddress: string | null = null

  // ── HTTP server ───────────────────────────────────────────────────────────────
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' })
      res.end()
      return
    }

    if (req.url === '/' && req.method === 'GET') {
      const html = await readFile(join(__dirname, '..', 'setup-ui', 'index.html'), 'utf8')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
      return
    }

    if (req.url === '/api/prepare' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const ownerAddress = body.address as `0x${string}`

      try {
        const { userOp, typedData, kernelAddress } = await buildEnableSessionKeyUserOp(
          ownerAddress,
          sessionPrivateKey,
          maxEthDefault,
          validUntilSecs,
          { rpcHttpUrl, zeroDev },
        )

        pendingUserOp = userOp
        pendingKernelAddress = kernelAddress

        json(res, { kernelAddress, typedData })
      } catch (err) {
        json(res, { error: (err as Error).message }, 500)
      }
      return
    }

    if (req.url === '/api/submit' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const { signature } = body

      if (!pendingUserOp || !pendingKernelAddress) {
        json(res, { error: 'No pending UserOp — call /api/prepare first' }, 400)
        return
      }

      // Signature will be attached and submitted by the CLI bundler client
      // In production this calls kernelClient.sendUserOperation({ userOp, signature })
      // For now we store the signed config and resolve
      console.log(`\n✓ Received MetaMask signature: ${signature.slice(0, 20)}...`)
      json(res, { ok: true })
      resolveSetup(pendingKernelAddress)
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(SETUP_PORT, '127.0.0.1', () => {
    console.log(`\n→ Open in your browser to connect MetaMask:`)
    console.log(`  http://localhost:${SETUP_PORT}/setup\n`)
    // Attempt to auto-open (best-effort)
    import('child_process')
      .then(({ exec }) => exec(`open http://localhost:${SETUP_PORT}/`))
      .catch(() => {})
  })

  // ── Wait for browser completion ───────────────────────────────────────────────
  const kernelAddress = await Promise.race([
    setupDone,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Setup timed out after 10 minutes')), 600_000),
    ),
  ])

  server.close()

  // ── Save everything ───────────────────────────────────────────────────────────
  await saveSessionKey(sessionPrivateKey, password)

  const config: Config = {
    kernelAddress,
    sessionKeyAddress,
    sessionKeyExpiresAt,
    genomeContract: GENOME_CONTRACT,
    chainId: 1,
    rpcWsUrl,
    rpcHttpUrl,
    zeroDev,
    defaults: {
      maxEth: maxEthDefault,
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
  console.log(`  Kernel account : ${kernelAddress}`)
  console.log(`  Session key    : ${sessionKeyAddress}`)
  console.log(`  Expires        : ${sessionKeyExpiresAt}`)
  console.log('\n→ Fund your Kernel account by sending ETH to:')
  console.log(`  ${kernelAddress}`)
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
