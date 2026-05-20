import { createPublicClient, http, formatEther, parseEther, type Hex } from 'viem'
import { mainnet } from 'viem/chains'
import { GENOME_CONTRACT, GENOME_ABI, BLOCK_PER_MINT } from './config.js'
import { sendBid, makePublicClient } from './wallet.js'
import { appendBidRecord } from './store.js'
import { sanitizeRpcError } from './validate.js'
import type { Config, AuctionStatus, AutoBidConfig, SnipeConfig, BidRecord } from './types.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

interface BidderState {
  privateKey: Hex | null
  appConfig: Config | null
  autoBid: {
    running: boolean
    config: AutoBidConfig | null
    intervalId: ReturnType<typeof setInterval> | null
    lastAction: string
    lastCheckedAt: string | undefined
    lastObservedAuction: AuctionStatus | undefined
    nextBidEth: string | undefined
    lastTxHash: string | undefined
    lastError: string | undefined
    sessionBidCount: number
    sessionEthSpentWei: bigint
  }
  snipe: {
    watching: boolean
    config: SnipeConfig | null
    unwatch: (() => void) | null
    transport: 'websocket' | 'http-polling' | null
    status: 'idle' | 'watching' | 'fired' | 'won' | 'failed'
    txHash: string | undefined
    triggeredAtBlock: number | undefined
    triggeredAt: string | undefined
    lastCheckedAt: string | undefined
    lastObservedAuction: AuctionStatus | undefined
    nextBidEth: string | undefined
    lastDecision: string
    stopReason: string | undefined
    lastError: string | undefined
  }
}

const state: BidderState = {
  privateKey: null,
  appConfig: null,
  autoBid: {
    running: false,
    config: null,
    intervalId: null,
    lastAction: 'not started',
    lastCheckedAt: undefined,
    lastObservedAuction: undefined,
    nextBidEth: undefined,
    lastTxHash: undefined,
    lastError: undefined,
    sessionBidCount: 0,
    sessionEthSpentWei: 0n,
  },
  snipe: {
    watching: false,
    config: null,
    unwatch: null,
    transport: null,
    status: 'idle',
    txHash: undefined,
    triggeredAtBlock: undefined,
    triggeredAt: undefined,
    lastCheckedAt: undefined,
    lastObservedAuction: undefined,
    nextBidEth: undefined,
    lastDecision: 'not started',
    stopReason: undefined,
    lastError: undefined,
  },
}

export function initBidder(privateKey: Hex, config: Config): void {
  state.privateKey = privateKey
  state.appConfig = config
}

export function isInitialized(): boolean {
  return state.privateKey !== null && state.appConfig !== null
}

function getPublicClient(config: Config) {
  return createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })
}

export async function getAuctionStatus(
  config: Config,
  walletAddress: string,
): Promise<AuctionStatus> {
  const client = getPublicClient(config)

  const [winnerAddr, topBidWei, minBidToOutbidWei, lastMintBlockNum, latestTokenIdNum, currentBlock] =
    await Promise.all([
      client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'winner' }),
      client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'topBid' }),
      client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'minBidToOutbid' }),
      client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'lastMintBlock' }),
      client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'latestTokenId' }),
      client.getBlockNumber(),
    ])

  const winner = winnerAddr as string
  const topBidWeiBigInt = topBidWei as bigint
  const deadlineBlock = Number(lastMintBlockNum) + Number(BLOCK_PER_MINT)
  const blocksRemaining = Math.max(0, deadlineBlock - Number(currentBlock))
  let effectiveMinBidToOutbidWei = minBidToOutbidWei as bigint

  // Genome uses lazy settlement. Once an auction has expired with an existing
  // winner, the next executable bid settles the old round and starts a fresh
  // one, so the real minimum becomes MIN_BID rather than the stale outbid price.
  if (blocksRemaining <= 0 && winner.toLowerCase() !== ZERO_ADDRESS) {
    effectiveMinBidToOutbidWei = await client.readContract({
      address: GENOME_CONTRACT,
      abi: GENOME_ABI,
      functionName: 'MIN_BID',
    }) as bigint
  }

  return {
    currentBlock: Number(currentBlock),
    latestTokenId: Number(latestTokenIdNum),
    winner,
    topBid: formatEther(topBidWeiBigInt),
    minBidToOutbid: formatEther(effectiveMinBidToOutbidWei),
    lastMintBlock: Number(lastMintBlockNum),
    deadlineBlock,
    blocksRemaining,
    isUserWinning: winner.toLowerCase() === walletAddress.toLowerCase(),
  }
}

async function tryBid(
  status: AuctionStatus,
  bidEth: string,
  opts: {
    gasStrategy?: 'normal' | 'fast'
    usePrivateMempool?: boolean
    gasPriorityMultiplier?: number
    dryRun?: boolean
  },
): Promise<string> {
  const config = state.appConfig!
  const key = state.privateKey!

  const txHash = await sendBid(config, key, bidEth, {
    dryRun: opts.dryRun,
    usePrivateMempool: opts.usePrivateMempool,
    gasPriorityMultiplier: opts.gasPriorityMultiplier ?? (opts.gasStrategy === 'fast' ? 2 : 1),
  })

  if (opts.dryRun) return txHash

  const record: BidRecord = {
    walletAddress: config.walletAddress,
    timestamp: new Date().toISOString(),
    txHash,
    bidEth,
    tokenId: status.latestTokenId,
    blockNumber: status.currentBlock,
    result: 'pending',
  }
  try {
    await appendBidRecord(record)
  } catch {
    // Record failure must not obscure a submitted transaction
  }

  return txHash
}

// ── Auto-bid ──────────────────────────────────────────────────────────────────

export function startAutoBid(cfg: AutoBidConfig): { ok: boolean; message: string } {
  if (state.autoBid.running) return { ok: false, message: 'auto-bid already running' }
  if (state.snipe.watching) return { ok: false, message: 'snipe is already watching — stop it first with stop_snipe' }
  if (!state.privateKey || !state.appConfig)
    return { ok: false, message: 'bidder not initialized — GENOME_BID_PASSWORD missing?' }

  state.autoBid.running = true
  state.autoBid.config = cfg
  state.autoBid.lastAction = 'started'
  state.autoBid.lastCheckedAt = undefined
  state.autoBid.lastObservedAuction = undefined
  state.autoBid.nextBidEth = undefined
  state.autoBid.lastTxHash = undefined
  state.autoBid.lastError = undefined
  state.autoBid.sessionBidCount = 0
  state.autoBid.sessionEthSpentWei = 0n

  let inFlight = false
  const tick = async () => {
    if (inFlight || !state.autoBid.running || !state.appConfig) return
    inFlight = true
    const bidCfg = state.autoBid.config!

    try {
      const checkedAt = new Date().toISOString()
      const status = await getAuctionStatus(state.appConfig, state.appConfig.walletAddress)
      state.autoBid.lastCheckedAt = checkedAt
      state.autoBid.lastObservedAuction = status
      state.autoBid.lastError = undefined

      if (status.blocksRemaining <= 0) {
        state.autoBid.nextBidEth = undefined
        state.autoBid.lastAction = 'auction settled, waiting for next round'
        return
      }

      if (status.isUserWinning) {
        state.autoBid.nextBidEth = undefined
        state.autoBid.lastAction = `winning at ${status.topBid} ETH (${status.blocksRemaining} blocks left)`
        return
      }

      state.autoBid.nextBidEth = status.minBidToOutbid

      if (status.blocksRemaining > bidCfg.leadBlocks) {
        state.autoBid.lastAction =
          `waiting for lead window: ${status.blocksRemaining} blocks remaining, ` +
          `trigger at <= ${bidCfg.leadBlocks}`
        return
      }

      const newBidWei = parseEther(status.minBidToOutbid)
      if (newBidWei > parseEther(bidCfg.maxEth)) {
        state.autoBid.lastAction =
          `minimum outbid ${status.minBidToOutbid} ETH exceeds max ${bidCfg.maxEth} ETH`
        return
      }

      const newBid = status.minBidToOutbid
      const txHash = await tryBid(status, newBid, { gasStrategy: bidCfg.gasStrategy, dryRun: bidCfg.dryRun })
      if (!bidCfg.dryRun) {
        state.autoBid.lastTxHash = txHash
        state.autoBid.sessionBidCount++
        state.autoBid.sessionEthSpentWei += parseEther(newBid)
      }
      state.autoBid.lastAction = `bid ${newBid} ETH tx:${txHash}`
    } catch (err) {
      const msg = sanitizeRpcError(err, state.appConfig!.rpcHttpUrl)
      state.autoBid.lastError = msg
      state.autoBid.lastAction = `error: ${msg}`
    } finally {
      inFlight = false
    }
  }

  state.autoBid.intervalId = setInterval(tick, 6_000)
  tick()

  return { ok: true, message: 'started' }
}

export function stopAutoBid(): string {
  const last = state.autoBid.lastAction
  state.autoBid.running = false
  state.autoBid.config = null
  state.autoBid.nextBidEth = undefined
  if (state.autoBid.intervalId) {
    clearInterval(state.autoBid.intervalId)
    state.autoBid.intervalId = null
  }
  return last
}

export function getAutoBidState() {
  return {
    running: state.autoBid.running,
    lastAction: state.autoBid.lastAction,
    config: state.autoBid.config,
    lastCheckedAt: state.autoBid.lastCheckedAt,
    lastObservedAuction: state.autoBid.lastObservedAuction,
    nextBidEth: state.autoBid.nextBidEth,
    lastTxHash: state.autoBid.lastTxHash,
    lastError: state.autoBid.lastError,
    session: {
      bidCount: state.autoBid.sessionBidCount,
      ethSpent: formatEther(state.autoBid.sessionEthSpentWei) + ' ETH',
    },
  }
}

// ── Snipe ─────────────────────────────────────────────────────────────────────

export function startSnipe(cfg: SnipeConfig): { ok: boolean; message: string } {
  if (state.snipe.watching) return { ok: false, message: 'snipe already watching' }
  if (state.autoBid.running) return { ok: false, message: 'auto-bid is already running — stop it first with stop_auto_bid' }
  if (!state.privateKey || !state.appConfig)
    return { ok: false, message: 'bidder not initialized' }

  const config = state.appConfig
  state.snipe.watching = true
  state.snipe.config = cfg
  state.snipe.transport = config.rpcWsUrl ? 'websocket' : 'http-polling'
  state.snipe.status = 'watching'
  state.snipe.txHash = undefined
  state.snipe.triggeredAtBlock = undefined
  state.snipe.triggeredAt = undefined
  state.snipe.lastCheckedAt = undefined
  state.snipe.lastObservedAuction = undefined
  state.snipe.nextBidEth = undefined
  state.snipe.lastDecision = 'watching for trigger window'
  state.snipe.stopReason = undefined
  state.snipe.lastError = undefined

  let inFlight = false

  const onBlock = async () => {
    if (!state.snipe.watching || !state.appConfig) return
    const snipeCfg = state.snipe.config!

    if (state.snipe.status === 'fired' || inFlight) return
    inFlight = true

    try {
      const checkedAt = new Date().toISOString()
      const status = await getAuctionStatus(state.appConfig, state.appConfig.walletAddress)
      state.snipe.lastCheckedAt = checkedAt
      state.snipe.lastObservedAuction = status

      if (status.blocksRemaining <= 0) {
        state.snipe.status = 'watching'
        state.snipe.txHash = undefined
        state.snipe.triggeredAtBlock = undefined
        state.snipe.triggeredAt = undefined
        state.snipe.nextBidEth = undefined
        state.snipe.lastDecision = 'auction settled, waiting for next round'
        return
      }

      const newBidWei = parseEther(status.minBidToOutbid)
      const newBid = status.minBidToOutbid
      state.snipe.nextBidEth = newBid

      if (status.isUserWinning) {
        state.snipe.status = 'won'
        state.snipe.lastDecision = `already winning at ${status.topBid} ETH`
        state.snipe.stopReason = 'wallet is already winning'
        _stopSnipeWatcher()
        return
      }

      if (status.blocksRemaining > snipeCfg.triggerBlocks) {
        state.snipe.lastDecision =
          `waiting for trigger window: ${status.blocksRemaining} blocks remaining, ` +
          `trigger at <= ${snipeCfg.triggerBlocks}`
        return
      }

      if (newBidWei > parseEther(snipeCfg.maxEth)) {
        state.snipe.status = 'failed'
        state.snipe.lastDecision = `next bid ${newBid} ETH exceeds max ${snipeCfg.maxEth} ETH`
        state.snipe.stopReason = 'required bid exceeded maxEth'
        _stopSnipeWatcher()
        return
      }

      state.snipe.status = 'fired'
      state.snipe.triggeredAtBlock = status.currentBlock
      state.snipe.triggeredAt = checkedAt
      state.snipe.lastDecision = `submitting bid ${newBid} ETH`
      const txHash = await tryBid(status, newBid, {
        usePrivateMempool: snipeCfg.usePrivateMempool,
        gasPriorityMultiplier: snipeCfg.gasPriorityMultiplier,
        dryRun: snipeCfg.dryRun,
      })
      state.snipe.txHash = txHash
      state.snipe.lastDecision = `submitted bid ${newBid} ETH tx:${txHash}`
      state.snipe.stopReason = 'bid submitted'
      _stopSnipeWatcher()
    } catch (err) {
      const msg = sanitizeRpcError(err, config.rpcHttpUrl)
      state.snipe.status = 'failed'
      state.snipe.lastError = msg
      state.snipe.lastDecision = `error: ${msg}`
      state.snipe.stopReason = 'runtime error'
      _stopSnipeWatcher()
    } finally {
      inFlight = false
    }
  }

  if (config.rpcWsUrl) {
    const wsClient = makePublicClient(config)
    state.snipe.unwatch = wsClient.watchBlocks({
      onBlock: () => { void onBlock() },
      onError: (err) => {
        const message = `watchBlocks error: ${sanitizeRpcError(err, config.rpcHttpUrl)}`
        state.snipe.lastError = message
        state.snipe.lastDecision = message
        state.snipe.status = 'failed'
        state.snipe.stopReason = 'watchBlocks error'
        _stopSnipeWatcher()
      },
    })
  } else {
    process.stderr.write('[genome-bid-mcp] No rpcWsUrl — snipe falling back to HTTP polling (less precise)\n')
    state.snipe.lastDecision = 'watching via HTTP polling because rpcWsUrl is not configured'
    const id = setInterval(() => { void onBlock() }, 3_000)
    state.snipe.unwatch = () => clearInterval(id)
    void onBlock()
  }

  return { ok: true, message: config.rpcWsUrl ? 'watching (WebSocket)' : 'watching (HTTP polling)' }
}

function _stopSnipeWatcher(): void {
  state.snipe.watching = false
  if (state.snipe.unwatch) {
    state.snipe.unwatch()
    state.snipe.unwatch = null
  }
}

export function stopSnipe(): void {
  _stopSnipeWatcher()
  state.snipe.config = null
  state.snipe.transport = null
  state.snipe.status = 'idle'
  state.snipe.txHash = undefined
  state.snipe.triggeredAtBlock = undefined
  state.snipe.triggeredAt = undefined
  state.snipe.lastCheckedAt = undefined
  state.snipe.lastObservedAuction = undefined
  state.snipe.nextBidEth = undefined
  state.snipe.lastError = undefined
  state.snipe.lastDecision = 'stopped manually'
  state.snipe.stopReason = 'stopped manually'
}

export function getSnipeState() {
  const lastObservedAuction = state.snipe.lastObservedAuction
  const config = state.snipe.config

  return {
    initialized: isInitialized(),
    walletAddress: state.appConfig?.walletAddress,
    watching: state.snipe.watching,
    transport: state.snipe.transport,
    status: state.snipe.status,
    config,
    txHash: state.snipe.txHash,
    triggeredAtBlock: state.snipe.triggeredAtBlock,
    triggeredAt: state.snipe.triggeredAt,
    lastCheckedAt: state.snipe.lastCheckedAt,
    lastDecision: state.snipe.lastDecision,
    stopReason: state.snipe.stopReason,
    lastError: state.snipe.lastError,
    nextBidEth: state.snipe.nextBidEth,
    lastObservedAuction,
    blocksUntilTrigger:
      config && lastObservedAuction
        ? Math.max(0, lastObservedAuction.blocksRemaining - config.triggerBlocks)
        : undefined,
    triggerWindowReached:
      config && lastObservedAuction
        ? lastObservedAuction.blocksRemaining <= config.triggerBlocks
        : undefined,
  }
}
