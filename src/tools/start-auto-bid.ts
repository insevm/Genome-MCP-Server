import { startAutoBid, isInitialized } from '../bidder.js'
import { loadConfig } from '../store.js'
import { validatePositiveDecimal } from '../validate.js'
import type { AutoBidConfig } from '../types.js'

interface StartAutoBidArgs {
  maxEth: string
  incrementEth?: string
  leadBlocks?: number
  gasStrategy?: 'normal' | 'fast'
  dryRun?: boolean
}

export async function handleStartAutoBid(args: StartAutoBidArgs): Promise<object> {
  if (!isInitialized()) {
    throw new Error(
      'Bidder not initialized. Make sure GENOME_BID_PASSWORD is set in the MCP server env.',
    )
  }

  validatePositiveDecimal(args.maxEth, 'maxEth')
  if (args.incrementEth !== undefined) validatePositiveDecimal(args.incrementEth, 'incrementEth')

  const config = await loadConfig()

  const bidConfig: AutoBidConfig = {
    maxEth: args.maxEth,
    incrementEth: args.incrementEth ?? config.defaults.incrementEth,
    leadBlocks: args.leadBlocks ?? config.defaults.leadBlocks,
    gasStrategy: args.gasStrategy ?? config.defaults.gasStrategy,
    dryRun: args.dryRun ?? false,
  }

  const result = startAutoBid(bidConfig)
  if (!result.ok) throw new Error(result.message)

  return {
    status: 'started',
    walletAddress: config.walletAddress,
    config: bidConfig,
  }
}
