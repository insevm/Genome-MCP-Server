#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { configExists, loadConfig, loadSessionKey } from './store.js'
import { initBidder } from './bidder.js'
import { getBidStatus } from './tools/get-bid-status.js'
import { handleStartAutoBid } from './tools/start-auto-bid.js'
import { handleStopAutoBid } from './tools/stop-auto-bid.js'
import { handleSnipeBid, handleGetSnipeStatus } from './tools/snipe-bid.js'
import { handleGetBidHistory } from './tools/get-bid-history.js'
import { handleGetWalletInfo } from './tools/get-wallet-info.js'
import { handleWithdrawEth } from './tools/withdraw-eth.js'
import { handleWithdrawGene } from './tools/withdraw-gene.js'

// ── Dispatch to setup CLI if invoked as `genome-bid-mcp setup` ───────────────
if (process.argv[2] === 'setup' || process.argv[2] === 'renew') {
  const { runSetup } = await import('./setup.js')
  await runSetup(process.argv[2] as 'setup' | 'renew')
  process.exit(0)
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'get_bid_status',
    description:
      'Query the current Genome auction state: top bid, winner, blocks remaining, whether the Kernel account is currently winning.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'start_auto_bid',
    description:
      'Start an automatic bid monitor. Watches the auction and re-bids whenever the Kernel account is outbid, up to maxEth. Runs in the background until stop_auto_bid is called.',
    inputSchema: {
      type: 'object',
      properties: {
        maxEth: {
          type: 'string',
          description: 'Maximum bid in ETH, e.g. "0.3"',
        },
        incrementEth: {
          type: 'string',
          description: 'Amount to outbid by each time, default "0.0001"',
        },
        leadBlocks: {
          type: 'number',
          description: 'Re-bid when this many blocks remain before deadline, default 2',
        },
        gasStrategy: {
          type: 'string',
          enum: ['normal', 'fast'],
          description: 'Gas strategy: normal (default) or fast (2× priority fee)',
        },
        dryRun: {
          type: 'boolean',
          description: 'Simulate without sending transactions',
        },
      },
      required: ['maxEth'],
    },
  },
  {
    name: 'stop_auto_bid',
    description: 'Stop the automatic bid monitor.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'snipe_bid',
    description:
      'End-of-auction snipe strategy. Watches silently and fires a single bid in the final N blocks with aggressive gas and Flashbots private mempool to avoid MEV frontrun. Can run alongside start_auto_bid.',
    inputSchema: {
      type: 'object',
      properties: {
        maxEth: {
          type: 'string',
          description: 'Maximum bid in ETH',
        },
        triggerBlocks: {
          type: 'number',
          description:
            'Fire when this many blocks remain before deadline. Default 1 (≈12 s window on Ethereum).',
        },
        gasPriorityMultiplier: {
          type: 'number',
          description: 'Multiply maxPriorityFeePerGas by this factor. Default 5.0',
        },
        usePrivateMempool: {
          type: 'boolean',
          description:
            'Submit via Flashbots Protect to hide tx from public mempool and avoid frontrun. Default true.',
        },
        dryRun: {
          type: 'boolean',
          description: 'Simulate without sending transactions',
        },
      },
      required: ['maxEth'],
    },
  },
  {
    name: 'get_bid_history',
    description: 'List recent bids placed by this Kernel account.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of records to return, default 20' },
      },
      required: [],
    },
  },
  {
    name: 'get_wallet_info',
    description: 'Show Kernel account balance and session key status.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'withdraw_eth',
    description:
      'Withdraw native ETH from the Kernel account to a specified address. Use amountEth: "all" to withdraw everything minus gas buffer.',
    inputSchema: {
      type: 'object',
      properties: {
        toAddress: { type: 'string', description: 'Recipient Ethereum address' },
        amountEth: { type: 'string', description: 'Amount in ETH, e.g. "0.1" or "all"' },
        dryRun: { type: 'boolean', description: 'Simulate without sending' },
      },
      required: ['toAddress', 'amountEth'],
    },
  },
  {
    name: 'withdraw_gene',
    description:
      'Transfer GENE (ERC20) from the Kernel account to a specified address. Only liquid (non-NFT-locked) GENE is transferable. Use amountGene: "all" to transfer the full liquid balance.',
    inputSchema: {
      type: 'object',
      properties: {
        toAddress: { type: 'string', description: 'Recipient Ethereum address' },
        amountGene: {
          type: 'string',
          description: 'Amount in GENE, e.g. "100" or "all". 1 GENE = 10^18 units.',
        },
        dryRun: { type: 'boolean', description: 'Simulate without sending' },
      },
      required: ['toAddress', 'amountGene'],
    },
  },
]

// Module-level session key so withdraw handlers can access it without re-decrypting
let _sessionKey: `0x${string}` | null = null

async function main() {
  // Load config + session key at startup so every tool call is fast
  const exists = await configExists()
  if (!exists) {
    process.stderr.write(
      '[genome-bid-mcp] No config found. Run: npx genome-bid-mcp setup\n',
    )
  } else {
    const password = process.env.GENOME_BID_PASSWORD
    if (!password) {
      process.stderr.write(
        '[genome-bid-mcp] GENOME_BID_PASSWORD env var not set — bid tools will fail.\n',
      )
    } else {
      try {
        const [config, sessionKey] = await Promise.all([
          loadConfig(),
          loadSessionKey(password),
        ])
        _sessionKey = sessionKey as `0x${string}`
        initBidder(_sessionKey, config)
        process.stderr.write(
          `[genome-bid-mcp] Ready. Kernel: ${config.kernelAddress}\n`,
        )
      } catch (err) {
        process.stderr.write(
          `[genome-bid-mcp] Failed to load session key: ${(err as Error).message}\n`,
        )
      }
    }
  }

  const server = new Server(
    { name: 'genome-bid-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params

    try {
      let result: object

      switch (name) {
        case 'get_bid_status':
          result = await getBidStatus()
          break
        case 'start_auto_bid':
          result = await handleStartAutoBid(args as Parameters<typeof handleStartAutoBid>[0])
          break
        case 'stop_auto_bid':
          result = handleStopAutoBid()
          break
        case 'snipe_bid':
          result = await handleSnipeBid(args as Parameters<typeof handleSnipeBid>[0])
          break
        case 'get_bid_history':
          result = await handleGetBidHistory(args as Parameters<typeof handleGetBidHistory>[0])
          break
        case 'get_wallet_info':
          result = await handleGetWalletInfo()
          break
        case 'withdraw_eth':
          if (!_sessionKey) throw new Error('Session key not loaded. GENOME_BID_PASSWORD set?')
          result = await handleWithdrawEth(
            args as Parameters<typeof handleWithdrawEth>[0],
            _sessionKey,
          )
          break
        case 'withdraw_gene':
          if (!_sessionKey) throw new Error('Session key not loaded. GENOME_BID_PASSWORD set?')
          result = await handleWithdrawGene(
            args as Parameters<typeof handleWithdrawGene>[0],
            _sessionKey,
          )
          break
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`[genome-bid-mcp] Fatal: ${err.message}\n`)
  process.exit(1)
})
