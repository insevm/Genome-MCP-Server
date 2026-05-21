import { startBidWatcher, getBidWatcherState, isInitialized } from '../bidder.js'
import { loadConfig } from '../store.js'
import type { BidWatcherConfig } from '../types.js'

interface StartBidArgs {
  maxEth: string
  triggerBlocks?: number
  bidBuffer?: number
  gasPriorityMultiplier?: number
  minPriorityFeeGwei?: number
  usePrivateMempool?: boolean
  dryRun?: boolean
}

export async function handleStartBid(args: StartBidArgs): Promise<object> {
  if (!isInitialized()) {
    throw new Error(
      'Bidder not initialized. Make sure GENOME_BID_PASSWORD is set in the MCP server env.',
    )
  }

  if (!/^\d+(\.\d{0,18})?$/.test(args.maxEth) || Number(args.maxEth) <= 0) {
    throw new Error('maxEth must be a positive decimal number (e.g. "0.1")')
  }

  if (
    args.triggerBlocks !== undefined &&
    (!Number.isInteger(args.triggerBlocks) || args.triggerBlocks < 1)
  ) {
    throw new Error('triggerBlocks must be an integer >= 1')
  }

  if (
    args.bidBuffer !== undefined &&
    (!Number.isFinite(args.bidBuffer) || args.bidBuffer < 0 || args.bidBuffer > 1)
  ) {
    throw new Error('bidBuffer must be a number between 0 and 1 (e.g. 0.05 for 5%)')
  }

  if (
    args.gasPriorityMultiplier !== undefined &&
    (!Number.isFinite(args.gasPriorityMultiplier) ||
      args.gasPriorityMultiplier < 1 ||
      args.gasPriorityMultiplier > 20)
  ) {
    throw new Error('gasPriorityMultiplier must be a number between 1 and 20')
  }

  if (
    args.minPriorityFeeGwei !== undefined &&
    (!Number.isFinite(args.minPriorityFeeGwei) || args.minPriorityFeeGwei <= 0)
  ) {
    throw new Error('minPriorityFeeGwei must be a positive number')
  }

  const config = await loadConfig()
  const bidDefs = config.defaults.bid

  const watcherConfig: BidWatcherConfig = {
    maxEth: args.maxEth,
    triggerBlocks: args.triggerBlocks ?? bidDefs.triggerBlocks,
    bidBuffer: args.bidBuffer ?? 0,
    gasPriorityMultiplier: args.gasPriorityMultiplier ?? bidDefs.gasPriorityMultiplier,
    minPriorityFeeGwei: args.minPriorityFeeGwei ?? bidDefs.minPriorityFeeGwei,
    usePrivateMempool: args.usePrivateMempool ?? bidDefs.usePrivateMempool,
    dryRun: args.dryRun ?? false,
  }

  const result = startBidWatcher(watcherConfig)
  if (!result.ok) throw new Error(result.message)

  const watcherState = getBidWatcherState()

  return {
    status: watcherState.status,
    transport: watcherState.transport,
    config: watcherConfig,
    walletAddress: config.walletAddress,
    strategy: watcherConfig.usePrivateMempool
      ? 'Tx will be submitted via Flashbots Protect to avoid MEV frontrun'
      : 'Tx will be submitted via public mempool',
  }
}
