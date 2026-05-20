import { startSnipe, getSnipeState, isInitialized } from '../bidder.js'
import { loadConfig } from '../store.js'
import { validatePositiveDecimal } from '../validate.js'
import type { SnipeConfig } from '../types.js'

interface SnipeBidArgs {
  maxEth: string
  triggerBlocks?: number
  gasPriorityMultiplier?: number
  minPriorityFeeGwei?: number
  usePrivateMempool?: boolean
  dryRun?: boolean
}

export async function handleSnipeBid(args: SnipeBidArgs): Promise<object> {
  if (!isInitialized()) {
    throw new Error(
      'Bidder not initialized. Make sure GENOME_BID_PASSWORD is set in the MCP server env.',
    )
  }

  validatePositiveDecimal(args.maxEth, 'maxEth')

  if (
    args.triggerBlocks !== undefined &&
    (!Number.isInteger(args.triggerBlocks) || args.triggerBlocks < 1)
  ) {
    throw new Error('triggerBlocks must be an integer >= 1')
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
  const snipeDefs = config.defaults.snipe

  const snipeConfig: SnipeConfig = {
    maxEth: args.maxEth,
    triggerBlocks: args.triggerBlocks ?? snipeDefs.triggerBlocks,
    gasPriorityMultiplier: args.gasPriorityMultiplier ?? snipeDefs.gasPriorityMultiplier,
    minPriorityFeeGwei: args.minPriorityFeeGwei,
    usePrivateMempool: args.usePrivateMempool ?? snipeDefs.usePrivateMempool,
    dryRun: args.dryRun ?? false,
  }

  const result = startSnipe(snipeConfig)
  if (!result.ok) throw new Error(result.message)

  const snipeState = getSnipeState()

  return {
    status: snipeState.status,
    config: snipeConfig,
    walletAddress: config.walletAddress,
    note: snipeConfig.usePrivateMempool
      ? 'Tx will be submitted via Flashbots Protect to avoid MEV frontrun'
      : 'Tx will be submitted via public mempool',
  }
}

export function handleGetSnipeStatus(): object {
  return getSnipeState()
}
