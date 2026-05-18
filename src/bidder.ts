import { createPublicClient, http, formatEther, parseEther, type Hex } from 'viem'
import { mainnet } from 'viem/chains'
import { GENOME_CONTRACT, GENOME_ABI, BLOCK_PER_MINT } from './config.js'
import { sendBid } from './kernel.js'
import { appendBidRecord } from './store.js'
import type { Config, AuctionStatus, AutoBidConfig, SnipeConfig, BidRecord } from './types.js'

interface BidderState {
  sessionPrivateKey: Hex | null
  appConfig: Config | null
  autoBid: {
    running: boolean
    config: AutoBidConfig | null
    intervalId: ReturnType<typeof setInterval> | null
    lastAction: string
  }
  snipe: {
    watching: boolean
    config: SnipeConfig | null
    intervalId: ReturnType<typeof setInterval> | null
    status: 'watching' | 'fired' | 'won' | 'failed'
    txHash: string | undefined
    triggeredAtBlock: number | undefined
  }
}

const state: BidderState = {
  sessionPrivateKey: null,
  appConfig: null,
  autoBid: {
    running: false,
    config: null,
    intervalId: null,
    lastAction: 'not started',
  },
  snipe: {
    watching: false,
    config: null,
    intervalId: null,
    status: 'watching',
    txHash: undefined,
    triggeredAtBlock: undefined,
  },
}

export function initBidder(sessionPrivateKey: Hex, config: Config): void {
  state.sessionPrivateKey = sessionPrivateKey
  state.appConfig = config
}

export function isInitialized(): boolean {
  return state.sessionPrivateKey !== null && state.appConfig !== null
}

function getPublicClient(config: Config) {
  return createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })
}

export async function getAuctionStatus(
  config: Config,
  kernelAddress: string,
): Promise<AuctionStatus> {
  const client = getPublicClient(config)

  const [winnerAddr, topBidWei, lastMintBlockNum, latestTokenIdNum, currentBlock] =
    await Promise.all([
      client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'winner' }),
      client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'topBid' }),
      client.readContract({
        address: GENOME_CONTRACT,
        abi: GENOME_ABI,
        functionName: 'lastMintBlock',
      }),
      client.readContract({
        address: GENOME_CONTRACT,
        abi: GENOME_ABI,
        functionName: 'latestTokenId',
      }),
      client.getBlockNumber(),
    ])

  const deadlineBlock = Number(lastMintBlockNum) + Number(BLOCK_PER_MINT)
  const blocksRemaining = Math.max(0, deadlineBlock - Number(currentBlock))

  return {
    currentBlock: Number(currentBlock),
    latestTokenId: Number(latestTokenIdNum),
    winner: winnerAddr as string,
    topBid: formatEther(topBidWei as bigint),
    lastMintBlock: Number(lastMintBlockNum),
    deadlineBlock,
    blocksRemaining,
    isUserWinning:
      (winnerAddr as string).toLowerCase() === kernelAddress.toLowerCase(),
  }
}

async function tryBid(
  status: AuctionStatus,
  bidEth: string,
  opts: { gasStrategy?: 'normal' | 'fast'; usePrivateMempool?: boolean; gasPriorityMultiplier?: number; dryRun?: boolean },
): Promise<string> {
  const config = state.appConfig!
  const key = state.sessionPrivateKey!

  const txHash = await sendBid(config, key, bidEth, {
    dryRun: opts.dryRun,
    usePrivateMempool: opts.usePrivateMempool,
    gasPriorityMultiplier: opts.gasPriorityMultiplier ?? (opts.gasStrategy === 'fast' ? 2 : 1),
  })

  const record: BidRecord = {
    timestamp: new Date().toISOString(),
    txHash,
    bidEth,
    tokenId: status.latestTokenId,
    result: 'pending',
  }
  await appendBidRecord(record)

  return txHash
}

// ── Auto-bid ──────────────────────────────────────────────────────────────────

export function startAutoBid(cfg: AutoBidConfig): { ok: boolean; message: string } {
  if (state.autoBid.running) return { ok: false, message: 'auto-bid already running' }
  if (!state.sessionPrivateKey || !state.appConfig)
    return { ok: false, message: 'bidder not initialized — MCP server missing GENOME_BID_PASSWORD?' }

  state.autoBid.running = true
  state.autoBid.config = cfg
  state.autoBid.lastAction = 'started'

  const tick = async () => {
    if (!state.autoBid.running || !state.appConfig) return
    const bidCfg = state.autoBid.config!

    try {
      const status = await getAuctionStatus(state.appConfig, state.appConfig.kernelAddress)

      if (status.blocksRemaining <= 0) {
        state.autoBid.lastAction = 'auction settled, waiting for next round'
        return
      }

      if (status.isUserWinning) {
        state.autoBid.lastAction = `winning at ${status.topBid} ETH (${status.blocksRemaining} blocks left)`
        return
      }

      // Only react when we're within leadBlocks of the deadline
      if (status.blocksRemaining > bidCfg.leadBlocks) return

      const newBidWei = parseEther(status.topBid) + parseEther(bidCfg.incrementEth)
      if (newBidWei > parseEther(bidCfg.maxEth)) {
        state.autoBid.lastAction = `top bid ${status.topBid} ETH + increment exceeds max ${bidCfg.maxEth} ETH`
        return
      }

      const newBid = formatEther(newBidWei)
      const txHash = await tryBid(status, newBid, {
        gasStrategy: bidCfg.gasStrategy,
        dryRun: bidCfg.dryRun,
      })
      state.autoBid.lastAction = `bid ${newBid} ETH tx:${txHash}`
    } catch (err) {
      state.autoBid.lastAction = `error: ${(err as Error).message}`
    }
  }

  // Poll every ~6 s (half a block on Ethereum)
  state.autoBid.intervalId = setInterval(tick, 6_000)
  tick()

  return { ok: true, message: 'started' }
}

export function stopAutoBid(): string {
  const last = state.autoBid.lastAction
  state.autoBid.running = false
  state.autoBid.config = null
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
  }
}

// ── Snipe ─────────────────────────────────────────────────────────────────────

export function startSnipe(cfg: SnipeConfig): { ok: boolean; message: string } {
  if (state.snipe.watching) return { ok: false, message: 'snipe already watching' }
  if (!state.sessionPrivateKey || !state.appConfig)
    return { ok: false, message: 'bidder not initialized' }

  state.snipe.watching = true
  state.snipe.config = cfg
  state.snipe.status = 'watching'
  state.snipe.txHash = undefined
  state.snipe.triggeredAtBlock = undefined

  const watch = async () => {
    if (!state.snipe.watching || !state.appConfig) return
    const snipeCfg = state.snipe.config!

    // Don't poll again after firing
    if (state.snipe.status === 'fired') return

    try {
      const status = await getAuctionStatus(state.appConfig, state.appConfig.kernelAddress)

      // New auction round started — reset and watch again
      if (status.blocksRemaining <= 0) {
        state.snipe.status = 'watching'
        state.snipe.txHash = undefined
        state.snipe.triggeredAtBlock = undefined
        return
      }

      if (status.isUserWinning) {
        state.snipe.status = 'won'
        _stopSnipeInterval()
        return
      }

      // Not in the snipe window yet
      if (status.blocksRemaining > snipeCfg.triggerBlocks) return

      // Check we can afford to outbid
      const newBidWei =
        parseEther(status.topBid) + parseEther(state.appConfig.defaults.incrementEth)
      if (newBidWei > parseEther(snipeCfg.maxEth)) {
        state.snipe.status = 'failed'
        _stopSnipeInterval()
        return
      }

      // Fire!
      state.snipe.status = 'fired'
      state.snipe.triggeredAtBlock = status.currentBlock

      const newBid = formatEther(newBidWei)
      const txHash = await tryBid(status, newBid, {
        usePrivateMempool: snipeCfg.usePrivateMempool,
        gasPriorityMultiplier: snipeCfg.gasPriorityMultiplier,
        dryRun: snipeCfg.dryRun,
      })
      state.snipe.txHash = txHash
    } catch (err) {
      state.snipe.status = 'failed'
      _stopSnipeInterval()
    }
  }

  // Poll every 3 s for precision in the final window
  state.snipe.intervalId = setInterval(watch, 3_000)
  watch()

  return { ok: true, message: 'watching' }
}

function _stopSnipeInterval(): void {
  if (state.snipe.intervalId) {
    clearInterval(state.snipe.intervalId)
    state.snipe.intervalId = null
  }
}

export function stopSnipe(): void {
  state.snipe.watching = false
  state.snipe.config = null
  _stopSnipeInterval()
}

export function getSnipeState() {
  return {
    watching: state.snipe.watching,
    status: state.snipe.status,
    txHash: state.snipe.txHash,
    triggeredAtBlock: state.snipe.triggeredAtBlock,
  }
}
