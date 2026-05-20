#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { configExists, loadConfig, loadSessionKey, setRpcConfig } from './store.js'
import { sanitizeRpcError } from './validate.js'
import { initBidder, setNotifyFn } from './bidder.js'
import { getBidStatus } from './tools/get-bid-status.js'
import { handlePlaceBid } from './tools/place-bid.js'
import { handleStartBid } from './tools/start-bid.js'
import { handleStopBid } from './tools/stop-bid.js'
import { handleGetBidWatcher } from './tools/get-bid-watcher.js'
import { handleGetBidHistory } from './tools/get-bid-history.js'
import { handleGetWalletInfo } from './tools/get-wallet-info.js'
import { handleWithdrawEth } from './tools/withdraw-eth.js'
import { handleWithdrawGene } from './tools/withdraw-gene.js'
import { handleSwapGene } from './tools/swap-gene.js'
import { handleAnalyzeAuctionHistory } from './tools/analyze-auction-history.js'
import { handleAnalyzeBidder } from './tools/analyze-bidder.js'
import { handleGetFloorPrice } from './tools/get-floor-price.js'
import { handleGetBidEvents } from './tools/get-bid-events.js'

if (process.argv[2] === 'setup' || process.argv[2] === 'renew') {
  const { runSetup } = await import('./setup.js')
  await runSetup(process.argv[2] as 'setup' | 'renew')
  process.exit(0)
}

const TOOLS: Tool[] = [
  {
    name: 'get_bid_status',
    description:
      'Query the current Genome auction state: top bid, the current minBidToOutbid, winner, blocks remaining, and whether the wallet is currently winning.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'place_bid',
    description:
      'Submit a single Genome bid with an explicit ETH amount. No monitoring or rebidding is performed. Returns the observed auction snapshot and the current minimum executable bid required for this one-shot transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        bidEth: { type: 'string', description: 'Exact bid amount in ETH to submit, e.g. "0.25"' },
        usePrivateMempool: { type: 'boolean', description: 'Submit via Flashbots Protect instead of the public mempool. Default false.' },
        gasPriorityMultiplier: { type: 'number', description: 'Multiply maxPriorityFeePerGas by this factor. Default 1. Range 1-20.' },
        dryRun: { type: 'boolean', description: 'Simulate without sending a transaction' },
      },
      required: ['bidEth'],
    },
  },
  {
    name: 'start_bid',
    description:
      'Start the unified bid watcher. Two-phase strategy: if no one else has bid when the trigger window opens, enters at the minimum price with normal gas (first-mover); if a competitor is present, fires a snipe bid with aggressive gas at the contract-required minBidToOutbid. ' +
      'Uses WebSocket block subscription when available, falls back to HTTP polling (3 s interval). ' +
      'Runs until the bid fires, maxEth is exceeded, or stop_bid is called. Use get_bid_watcher_status to monitor progress.',
    inputSchema: {
      type: 'object',
      properties: {
        maxEth: { type: 'string', description: 'Maximum bid in ETH, e.g. "0.3"' },
        triggerBlocks: { type: 'number', description: 'Enter the bidding window when this many blocks remain before deadline. Default 1.' },
        gasPriorityMultiplier: { type: 'number', description: 'Multiply maxPriorityFeePerGas by this factor for snipe bids. Default 5.0. Range 1–20. Use analyze_auction_history snipeWindowGas to calibrate.' },
        minPriorityFeeGwei: { type: 'number', description: 'Absolute floor for maxPriorityFeePerGas in gwei (snipe bids). Overrides multiplier when higher. Useful when base fee is very low.' },
        usePrivateMempool: { type: 'boolean', description: 'Submit snipe bid via Flashbots Protect instead of the public mempool. Default false.' },
        dryRun: { type: 'boolean', description: 'Simulate without sending transactions' },
      },
      required: ['maxEth'],
    },
  },
  {
    name: 'stop_bid',
    description: 'Stop the active bid watcher.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_bid_watcher_status',
    description:
      'Inspect the current bid watcher state: active config, transport mode (WebSocket or HTTP polling), latest observed auction snapshot, trigger-window progress, candidate next bid, and any error or stop reason.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_bid_events',
    description:
      'Drain and return all unread bidding events since the last call. ' +
      'Event types: bid_placed (transaction submitted), max_eth_exceeded (required bid exceeded maxEth limit), error (runtime failure). ' +
      'The queue is cleared on each call. Poll this tool periodically while the bid watcher is active to stay informed of activity.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_bid_history',
    description:
      'List recent bid submissions recorded locally by this MCP server and tagged with the current wallet address. This is not a full on-chain history and does not backfill final win/outbid results.',
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
    name: 'get_floor_price',
    description:
      'Estimate the current spot break-even bid price for the next Genome NFT auction. ' +
      'Reads the GENE embedded in the next NFT (based on the current halving era), ' +
      'then quotes selling that GENE on Uniswap V3 to estimate the ETH recovery value at current pool prices. ' +
      'This estimate does not include bid gas, sell gas, or future price movement/slippage. Use it as a reference before setting maxEth.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'analyze_auction_history',
    description:
      'Read on-chain BidPlaced and AuctionSettled events for the last N completed auction rounds. Returns per-round bid records (who bid, how much, how many blocks before deadline), winning bid stats, and a leaderboard of the most active bidders. Use this to understand the competitive landscape before deciding a bidding strategy.',
    inputSchema: {
      type: 'object',
      properties: {
        rounds: { type: 'number', description: 'Number of completed rounds to analyze, default 10, max 20' },
      },
      required: [],
    },
  },
  {
    name: 'analyze_bidder',
    description:
      'Analyze a specific Ethereum address\'s historical bidding behavior in Genome auctions. Returns win rate, highest and average bid, bid timing pattern (sniper vs early bidder vs mid-round), and bid increment distribution. Use this to profile a competitor and calibrate your counter-strategy.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Ethereum address to analyze' },
        rounds:  { type: 'number', description: 'Number of recent rounds to look back, default 20, max 50' },
      },
      required: ['address'],
    },
  },
  {
    name: 'swap_gene',
    description:
      'Buy or sell GENE on Uniswap V3 (ETH/GENE 0.3% pool). Specify direction ("buy" or "sell") and exactly one of ethAmount or geneAmount — the other side is quoted from the pool.',
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
  const rpcHttpUrl = process.env.GENOME_RPC_HTTP_URL
  const rpcWsUrl = process.env.GENOME_RPC_WS_URL
  const password = process.env.GENOME_BID_PASSWORD

  if (!rpcHttpUrl) {
    process.stderr.write('[genome-bid-mcp] GENOME_RPC_HTTP_URL env var not set — all tools will fail.\n')
  } else {
    try {
      setRpcConfig(rpcHttpUrl, rpcWsUrl)
    } catch (err) {
      process.stderr.write(`[genome-bid-mcp] Invalid RPC config: ${(err as Error).message}\n`)
    }
  }

  const exists = await configExists()
  if (!exists) {
    process.stderr.write('[genome-bid-mcp] No config found. Run: npx genome-bid-mcp setup\n')
  } else {
    if (!password || password.length === 0) {
      process.stderr.write('[genome-bid-mcp] GENOME_BID_PASSWORD env var not set — bid tools will fail.\n')
    } else if (rpcHttpUrl) {
      try {
        const [config, privateKey] = await Promise.all([loadConfig(), loadSessionKey(password)])
        _privateKey = privateKey as `0x${string}`
        initBidder(_privateKey, config)
        process.stderr.write(`[genome-bid-mcp] Ready. Wallet: ${config.walletAddress}\n`)
      } catch (err) {
        process.stderr.write(`[genome-bid-mcp] Failed to initialize: ${(err as Error).message}\n`)
      }
    }
  }

  const server = new Server(
    { name: 'genome-bid-mcp', version: '0.2.0' },
    { capabilities: { tools: {}, logging: {} } },
  )

  setNotifyFn((level, message) => {
    server.notification({
      method: 'notifications/message',
      params: { level, logger: 'genome-auto-bid', data: message },
    }).catch(() => { /* client may not support logging notifications */ })
  })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params

    try {
      let result: object

      switch (name) {
        case 'get_bid_status':
          result = await getBidStatus()
          break
        case 'place_bid':
          if (!_privateKey) throw new Error('Wallet key not loaded. GENOME_BID_PASSWORD set?')
          result = await handlePlaceBid(args as unknown as Parameters<typeof handlePlaceBid>[0], _privateKey)
          break
        case 'start_bid':
          result = await handleStartBid(args as unknown as Parameters<typeof handleStartBid>[0])
          break
        case 'stop_bid':
          result = handleStopBid()
          break
        case 'get_bid_watcher_status':
          result = handleGetBidWatcher()
          break
        case 'get_bid_events':
          result = handleGetBidEvents()
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
        case 'get_floor_price':
          result = await handleGetFloorPrice()
          break
        case 'analyze_auction_history':
          result = await handleAnalyzeAuctionHistory(args as unknown as Parameters<typeof handleAnalyzeAuctionHistory>[0])
          break
        case 'analyze_bidder':
          result = await handleAnalyzeBidder(args as unknown as Parameters<typeof handleAnalyzeBidder>[0])
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
      return { content: [{ type: 'text', text: `Error: ${sanitizeRpcError(err, '')}` }], isError: true }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`[genome-bid-mcp] Fatal: ${err.message}\n`)
  process.exit(1)
})
