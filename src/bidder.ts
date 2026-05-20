import { createPublicClient, http, formatEther, parseEther, type Hex } from 'viem'
import { mainnet } from 'viem/chains'
import { GENOME_CONTRACT, GENOME_ABI, BLOCK_PER_MINT } from './config.js'
import { sendBid, makePublicClient } from './wallet.js'
import { appendBidRecord } from './store.js'
import { sanitizeRpcError } from './validate.js'
import type { Config, AuctionStatus, BidWatcherConfig, BidWatcherSnapshot, BidRecord, BidEvent } from './types.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const EVENT_QUEUE_MAX = 100

const _eventQueue: BidEvent[] = []

let _notifyFn: ((level: 'info' | 'warning' | 'error', message: string) => void) | null = null

export function setNotifyFn(fn: typeof _notifyFn): void {
  _notifyFn = fn
}

interface BidderState {
  privateKey: Hex | null
  appConfig: Config | null
  watcher: {
    active: boolean
    config: BidWatcherConfig | null
    unwatch: (() => void) | null
    transport: 'websocket' | 'http-polling' | null
    status: 'idle' | 'watching' | 'first_bid_placed' | 'fired' | 'won' | 'failed'
    txHash: string | undefined
    firstBidTxHash: string | undefined
    triggeredAtBlock: number | undefined
    triggeredAt: string | undefined
    lastCheckedAt: string | undefined
    lastObservedAuction: AuctionStatus | undefined
    nextBidEth: string | undefined
    lastDecision: string
    stopReason: string | undefined
    lastError: string | undefined
    stoppedAt: string | undefined
  }
}

const state: BidderState = {
  privateKey: null,
  appConfig: null,
  watcher: {
    active: false,
    config: null,
    unwatch: null,
    transport: null,
    status: 'idle',
    txHash: undefined,
    firstBidTxHash: undefined,
    triggeredAtBlock: undefined,
    triggeredAt: undefined,
    lastCheckedAt: undefined,
    lastObservedAuction: undefined,
    nextBidEth: undefined,
    lastDecision: 'not started',
    stopReason: undefined,
    lastError: undefined,
    stoppedAt: undefined,
  },
}

function pushEvent(event: BidEvent): void {
  const last = _eventQueue[_eventQueue.length - 1]
  if (last?.type === event.type && last?.message === event.message) return
  _eventQueue.push(event)
  if (_eventQueue.length > EVENT_QUEUE_MAX) _eventQueue.shift()
  const level = event.type === 'error' ? 'error' : 'info'
  _notifyFn?.(level, event.message)
}

export function drainBidEvents(): BidEvent[] {
  const events = [..._eventQueue]
  _eventQueue.length = 0
  return events
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
    usePrivateMempool?: boolean
    gasPriorityMultiplier?: number
    minPriorityFeeGwei?: number
    dryRun?: boolean
  },
): Promise<string> {
  const config = state.appConfig!
  const key = state.privateKey!

  const txHash = await sendBid(config, key, bidEth, {
    dryRun: opts.dryRun,
    usePrivateMempool: opts.usePrivateMempool,
    gasPriorityMultiplier: opts.gasPriorityMultiplier ?? 1,
    minPriorityFeeGwei: opts.minPriorityFeeGwei,
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

// ── Bid Watcher helpers ───────────────────────────────────────────────────────

function _resetForNewRound(): void {
  state.watcher.status = 'watching'
  state.watcher.txHash = undefined
  state.watcher.firstBidTxHash = undefined
  state.watcher.triggeredAtBlock = undefined
  state.watcher.triggeredAt = undefined
  state.watcher.nextBidEth = undefined
  state.watcher.lastDecision = 'auction settled, waiting for next round'
}

async function _handleFirstMover(status: AuctionStatus, watchCfg: BidWatcherConfig): Promise<void> {
  const txHash = await tryBid(status, status.minBidToOutbid, {
    gasPriorityMultiplier: 1,
    dryRun: watchCfg.dryRun,
  })
  state.watcher.firstBidTxHash = txHash
  state.watcher.status = 'first_bid_placed'
  state.watcher.lastDecision = `entered at ${status.minBidToOutbid} ETH (no competition)`
  if (!watchCfg.dryRun) {
    pushEvent({
      type: 'bid_placed',
      strategy: 'bid-watcher',
      timestamp: new Date().toISOString(),
      message: `[bid] First bid ${status.minBidToOutbid} ETH for token #${status.latestTokenId} — tx: ${txHash}`,
      tokenId: status.latestTokenId,
      txHash,
      bidEth: status.minBidToOutbid,
    })
  }
}

async function _handleSnipe(
  status: AuctionStatus,
  watchCfg: BidWatcherConfig,
  checkedAt: string,
): Promise<void> {
  const newBidWei = parseEther(status.minBidToOutbid)
  if (newBidWei > parseEther(watchCfg.maxEth)) {
    const msg = `next bid ${status.minBidToOutbid} ETH exceeds max ${watchCfg.maxEth} ETH`
    state.watcher.status = 'failed'
    state.watcher.lastDecision = msg
    state.watcher.stopReason = 'required bid exceeded maxEth'
    pushEvent({
      type: 'max_eth_exceeded',
      strategy: 'bid-watcher',
      timestamp: new Date().toISOString(),
      message: `[bid] ${msg}`,
      tokenId: status.latestTokenId,
    })
    _stopWatcher()
    return
  }

  state.watcher.triggeredAtBlock = status.currentBlock
  state.watcher.triggeredAt = checkedAt
  state.watcher.lastDecision = `submitting snipe bid ${status.minBidToOutbid} ETH`

  const txHash = await tryBid(status, status.minBidToOutbid, {
    usePrivateMempool: watchCfg.usePrivateMempool,
    gasPriorityMultiplier: watchCfg.gasPriorityMultiplier,
    minPriorityFeeGwei: watchCfg.minPriorityFeeGwei,
    dryRun: watchCfg.dryRun,
  })

  // Set status AFTER the tx resolves so observers never see 'fired' without a txHash
  state.watcher.status = 'fired'
  state.watcher.txHash = txHash
  state.watcher.lastDecision = `snipe bid submitted: ${status.minBidToOutbid} ETH tx:${txHash}`
  state.watcher.stopReason = 'snipe bid submitted'

  if (!watchCfg.dryRun) {
    pushEvent({
      type: 'bid_placed',
      strategy: 'bid-watcher',
      timestamp: new Date().toISOString(),
      message: `[bid] Snipe bid ${status.minBidToOutbid} ETH for token #${status.latestTokenId} — tx: ${txHash}`,
      tokenId: status.latestTokenId,
      txHash,
      bidEth: status.minBidToOutbid,
    })
  }
  _stopWatcher()
}

// ── Bid Watcher ───────────────────────────────────────────────────────────────

export function startBidWatcher(cfg: BidWatcherConfig): { ok: boolean; message: string } {
  if (state.watcher.active) return { ok: false, message: 'bid watcher already active' }
  if (!state.privateKey || !state.appConfig)
    return { ok: false, message: 'bidder not initialized — GENOME_BID_PASSWORD missing?' }

  const config = state.appConfig
  state.watcher.active = true
  state.watcher.config = cfg
  state.watcher.transport = config.rpcWsUrl ? 'websocket' : 'http-polling'
  state.watcher.status = 'watching'
  state.watcher.txHash = undefined
  state.watcher.firstBidTxHash = undefined
  state.watcher.triggeredAtBlock = undefined
  state.watcher.triggeredAt = undefined
  state.watcher.lastCheckedAt = undefined
  state.watcher.lastObservedAuction = undefined
  state.watcher.nextBidEth = undefined
  state.watcher.lastDecision = 'watching for trigger window'
  state.watcher.stopReason = undefined
  state.watcher.lastError = undefined
  state.watcher.stoppedAt = undefined

  let inFlight = false

  const onBlock = async () => {
    if (!state.watcher.active || !state.appConfig) return
    const watchCfg = state.watcher.config!

    if (state.watcher.status === 'fired' || inFlight) return
    inFlight = true

    try {
      const checkedAt = new Date().toISOString()
      const status = await getAuctionStatus(state.appConfig, state.appConfig.walletAddress)
      state.watcher.lastCheckedAt = checkedAt
      state.watcher.lastObservedAuction = status
      state.watcher.lastError = undefined

      if (status.blocksRemaining <= 0) {
        _resetForNewRound()
        return
      }

      state.watcher.nextBidEth = status.minBidToOutbid

      if (status.isUserWinning) {
        state.watcher.status = 'won'
        state.watcher.lastDecision = `already winning at ${status.topBid} ETH`
        state.watcher.stopReason = 'wallet is already winning'
        _stopWatcher()
        return
      }

      if (status.blocksRemaining > watchCfg.triggerBlocks) {
        state.watcher.lastDecision =
          `waiting for trigger window: ${status.blocksRemaining} blocks remaining, ` +
          `trigger at <= ${watchCfg.triggerBlocks}`
        return
      }

      const noCompetition = status.winner.toLowerCase() === ZERO_ADDRESS

      if (noCompetition && state.watcher.status !== 'first_bid_placed') {
        await _handleFirstMover(status, watchCfg)
        return
      }

      if (noCompetition) {
        state.watcher.lastDecision = 'first bid submitted, waiting for confirmation'
        return
      }

      await _handleSnipe(status, watchCfg, checkedAt)

    } catch (err) {
      const msg = sanitizeRpcError(err, config.rpcHttpUrl)
      state.watcher.status = 'failed'
      state.watcher.lastError = msg
      state.watcher.lastDecision = `error: ${msg}`
      state.watcher.stopReason = 'runtime error'
      pushEvent({ type: 'error', strategy: 'bid-watcher', timestamp: new Date().toISOString(), message: `[bid] Error: ${msg}` })
      _stopWatcher()
    } finally {
      inFlight = false
    }
  }

  if (config.rpcWsUrl) {
    let heartbeatId: ReturnType<typeof setInterval> | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT = 3

    const startWs = () => {
      if (!state.watcher.active) return

      const wsClient = makePublicClient(config)
      let wsUnwatch: (() => void) | null = null

      // Heartbeat: ping every 30s to prevent Alchemy/provider idle-timeout disconnects
      heartbeatId = setInterval(() => {
        wsClient.getBlockNumber().catch(() => {})
      }, 30_000)

      wsUnwatch = wsClient.watchBlocks({
        onBlock: () => {
          reconnectAttempts = 0  // successful block resets the retry counter
          void onBlock()
        },
        onError: (err) => {
          if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null }
          if (!state.watcher.active) return

          reconnectAttempts++
          const errMsg = sanitizeRpcError(err, config.rpcHttpUrl)

          // Clean up the dead viem subscription before installing a new unwatch
          wsUnwatch?.()
          wsUnwatch = null

          if (reconnectAttempts <= MAX_RECONNECT) {
            const delay = 2_000 * reconnectAttempts  // 2s, 4s, 6s
            const label = `${reconnectAttempts}/${MAX_RECONNECT}`
            process.stderr.write(`[genome-bid-mcp] [bid] WebSocket error (${label}), reconnecting in ${delay / 1_000}s: ${errMsg}\n`)
            state.watcher.lastError = errMsg
            state.watcher.lastDecision = `WebSocket dropped, reconnecting (${label})`
            const timer = setTimeout(startWs, delay)
            state.watcher.unwatch = () => clearTimeout(timer)
          } else {
            reconnectAttempts = 0
            const warnMsg = `WebSocket failed after ${MAX_RECONNECT} retries, falling back to HTTP polling: ${errMsg}`
            process.stderr.write(`[genome-bid-mcp] [bid] ${warnMsg}\n`)
            state.watcher.lastError = errMsg
            state.watcher.transport = 'http-polling'
            state.watcher.lastDecision = 'WebSocket failed after retries, continuing via HTTP polling'
            const pollId = setInterval(() => { void onBlock() }, 3_000)
            state.watcher.unwatch = () => clearInterval(pollId)
            pushEvent({ type: 'error', strategy: 'bid-watcher', timestamp: new Date().toISOString(), message: `[bid] ${warnMsg}` })
            void onBlock()
          }
        },
      })

      state.watcher.transport = 'websocket'
      state.watcher.unwatch = () => {
        if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null }
        wsUnwatch?.()
      }
    }

    startWs()
  } else {
    process.stderr.write('[genome-bid-mcp] No rpcWsUrl — bid watcher using HTTP polling (3s)\n')
    state.watcher.lastDecision = 'watching via HTTP polling (rpcWsUrl not configured)'
    const id = setInterval(() => { void onBlock() }, 3_000)
    state.watcher.unwatch = () => clearInterval(id)
    void onBlock()
  }

  return { ok: true, message: config.rpcWsUrl ? 'watching (WebSocket)' : 'watching (HTTP polling)' }
}

function _stopWatcher(): void {
  state.watcher.active = false
  state.watcher.stoppedAt = new Date().toISOString()
  if (state.watcher.unwatch) {
    state.watcher.unwatch()
    state.watcher.unwatch = null
  }
}

export function stopBidWatcher(): void {
  _stopWatcher()
  state.watcher.config = null
  state.watcher.transport = null
  state.watcher.status = 'idle'
  state.watcher.txHash = undefined
  state.watcher.firstBidTxHash = undefined
  state.watcher.triggeredAtBlock = undefined
  state.watcher.triggeredAt = undefined
  state.watcher.lastCheckedAt = undefined
  state.watcher.lastObservedAuction = undefined
  state.watcher.nextBidEth = undefined
  state.watcher.lastError = undefined
  state.watcher.stoppedAt = undefined
  state.watcher.lastDecision = 'stopped manually'
  state.watcher.stopReason = 'stopped manually'
}

export function getBidWatcherState(): BidWatcherSnapshot {
  const lastObservedAuction = state.watcher.lastObservedAuction
  const config = state.watcher.config

  return {
    initialized: isInitialized(),
    walletAddress: state.appConfig?.walletAddress,
    active: state.watcher.active,
    transport: state.watcher.transport,
    status: state.watcher.status,
    config,
    txHash: state.watcher.txHash,
    firstBidTxHash: state.watcher.firstBidTxHash,
    triggeredAtBlock: state.watcher.triggeredAtBlock,
    triggeredAt: state.watcher.triggeredAt,
    lastCheckedAt: state.watcher.lastCheckedAt,
    lastDecision: state.watcher.lastDecision,
    stopReason: state.watcher.stopReason,
    lastError: state.watcher.lastError,
    stoppedAt: state.watcher.stoppedAt,
    nextBidEth: state.watcher.nextBidEth,
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
