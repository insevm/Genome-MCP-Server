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
import { handleSwapGene } from './tools/swap-gene.js'

if (process.argv[2] === 'setup' || process.argv[2] === 'renew') {
  const { runSetup } = await import('./setup.js')
  await runSetup(process.argv[2] as 'setup' | 'renew')
  process.exit(0)
}

const TOOLS: Tool[] = [
  {
    name: 'get_bid_status',
    description:
      'Query the current Genome auction state: top bid, winner, blocks remaining, whether the wallet is currently winning.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'start_auto_bid',
    description:
      'Start an automatic bid monitor. Watches the auction and re-bids whenever the wallet is outbid, up to maxEth. Runs in the background until stop_auto_bid is called.',
    inputSchema: {
      type: 'object',
      properties: {
        maxEth: { type: 'string', description: 'Maximum bid in ETH, e.g. "0.3"' },
        incrementEth: { type: 'string', description: 'Amount to outbid by each time, default "0.0001"' },
        leadBlocks: { type: 'number', description: 'Re-bid when this many blocks remain before deadline, default 2' },
        gasStrategy: { type: 'string', enum: ['normal', 'fast'], description: 'Gas strategy: normal (default) or fast (2× priority fee)' },
        dryRun: { type: 'boolean', description: 'Simulate without sending transactions' },
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
      'End-of-auction snipe strategy. Fires a single bid in the final N blocks with aggressive gas and Flashbots private mempool. Can run alongside start_auto_bid.',
    inputSchema: {
      type: 'object',
      properties: {
        maxEth: { type: 'string', description: 'Maximum bid in ETH' },
        triggerBlocks: { type: 'number', description: 'Fire when this many blocks remain before deadline. Default 1.' },
        gasPriorityMultiplier: { type: 'number', description: 'Multiply maxPriorityFeePerGas by this factor. Default 5.0' },
        usePrivateMempool: { type: 'boolean', description: 'Submit via Flashbots Protect. Default true.' },
        dryRun: { type: 'boolean', description: 'Simulate without sending transactions' },
      },
      required: ['maxEth'],
    },
  },
  {
    name: 'get_bid_history',
    description: 'List recent bids placed by this wallet.',
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
    description: 'Show wallet ETH balance, GENE balance, and default bid settings.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'withdraw_eth',
    description:
      'Withdraw native ETH from the wallet to a specified address. Use amountEth: "all" to withdraw everything minus a gas buffer.',
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
      'Transfer GENE tokens from the wallet to a specified address. Use amountGene: "all" to transfer the full balance.',
    inputSchema: {
      type: 'object',
      properties: {
        toAddress: { type: 'string', description: 'Recipient Ethereum address' },
        amountGene: { type: 'string', description: 'Amount in GENE, e.g. "100" or "all"' },
        dryRun: { type: 'boolean', description: 'Simulate without sending' },
      },
      required: ['toAddress', 'amountGene'],
    },
  },
  {
    name: 'swap_gene',
    description:
      'Buy or sell GENE on Uniswap V3 (ETH/GENE 0.3% pool). Specify direction ("buy" or "sell") and either an ETH amount or a GENE amount — the other side is quoted from the pool.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['buy', 'sell'], description: '"buy" = ETH → GENE, "sell" = GENE → ETH' },
        ethAmount: { type: 'string', description: 'ETH amount: how much to spend (buy) or how much to receive (sell)' },
        geneAmount: { type: 'string', description: 'GENE amount: how much to receive (buy) or how much to sell (sell)' },
        slippageBps: { type: 'number', description: 'Slippage tolerance in basis points. Default 50 (0.5%)' },
        dryRun: { type: 'boolean', description: 'Quote without sending transaction' },
      },
      required: ['direction'],
    },
  },
]

let _privateKey: `0x${string}` | null = null

async function main() {
  const exists = await configExists()
  if (!exists) {
    process.stderr.write('[genome-bid-mcp] No config found. Run: npx genome-bid-mcp setup\n')
  } else {
    const password = process.env.GENOME_BID_PASSWORD
    if (!password) {
      process.stderr.write('[genome-bid-mcp] GENOME_BID_PASSWORD env var not set — bid tools will fail.\n')
    } else {
      try {
        const [config, privateKey] = await Promise.all([loadConfig(), loadSessionKey(password)])
        _privateKey = privateKey as `0x${string}`
        initBidder(_privateKey, config)
        process.stderr.write(`[genome-bid-mcp] Ready. Wallet: ${config.walletAddress}\n`)
      } catch (err) {
        process.stderr.write(`[genome-bid-mcp] Failed to load wallet key: ${(err as Error).message}\n`)
      }
    }
  }

  const server = new Server(
    { name: 'genome-bid-mcp', version: '0.2.0' },
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
          result = await handleStartAutoBid(args as unknown as Parameters<typeof handleStartAutoBid>[0])
          break
        case 'stop_auto_bid':
          result = handleStopAutoBid()
          break
        case 'snipe_bid':
          result = await handleSnipeBid(args as unknown as Parameters<typeof handleSnipeBid>[0])
          break
        case 'get_bid_history':
          result = await handleGetBidHistory(args as unknown as Parameters<typeof handleGetBidHistory>[0])
          break
        case 'get_wallet_info':
          result = await handleGetWalletInfo()
          break
        case 'withdraw_eth':
          if (!_privateKey) throw new Error('Wallet key not loaded. GENOME_BID_PASSWORD set?')
          result = await handleWithdrawEth(args as unknown as Parameters<typeof handleWithdrawEth>[0], _privateKey)
          break
        case 'withdraw_gene':
          if (!_privateKey) throw new Error('Wallet key not loaded. GENOME_BID_PASSWORD set?')
          result = await handleWithdrawGene(args as unknown as Parameters<typeof handleWithdrawGene>[0], _privateKey)
          break
        case 'swap_gene':
          if (!_privateKey) throw new Error('Wallet key not loaded. GENOME_BID_PASSWORD set?')
          result = await handleSwapGene(args as unknown as Parameters<typeof handleSwapGene>[0], _privateKey)
          break
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
      }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`[genome-bid-mcp] Fatal: ${err.message}\n`)
  process.exit(1)
})
