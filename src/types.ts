export interface Config {
  walletAddress: string
  genomeContract: string
  chainId: number
  rpcWsUrl?: string
  rpcHttpUrl: string
  defaults: {
    maxEth: string
    bid: {
      triggerBlocks: number
      gasPriorityMultiplier: number
      minPriorityFeeGwei?: number
      usePrivateMempool: boolean
    }
  }
}

export interface BidEvent {
  type: 'bid_placed' | 'max_eth_exceeded' | 'error'
  strategy: 'bid-watcher'
  timestamp: string
  message: string
  tokenId?: number
  txHash?: string
  bidEth?: string
}

export interface BidRecord {
  walletAddress: string
  timestamp: string
  txHash: string
  bidEth: string
  tokenId?: number
  blockNumber?: number
  result: 'won' | 'outbid' | 'pending'
}

export interface AuctionStatus {
  currentBlock: number
  latestTokenId: number
  winner: string
  topBid: string
  minBidToOutbid: string
  lastMintBlock: number
  deadlineBlock: number
  blocksRemaining: number
  isUserWinning: boolean
}

// Minimal per-block data fetched by the watcher hot path (2–3 RPC calls).
export interface WatcherTick {
  winner: string
  minBidToOutbid: string
  currentBlock: number
  blocksRemaining: number
  isUserWinning: boolean
}

export interface BidWatcherConfig {
  maxEth: string
  triggerBlocks: number
  bidBuffer: number
  gasPriorityMultiplier: number
  minPriorityFeeGwei?: number
  usePrivateMempool: boolean
  dryRun: boolean
}

export interface BidWatcherSnapshot {
  initialized: boolean
  walletAddress: string | undefined
  active: boolean
  transport: 'websocket' | 'http-polling' | null
  status: 'idle' | 'watching' | 'first_bid_placed' | 'fired' | 'won' | 'failed'
  config: BidWatcherConfig | null
  txHash: string | undefined
  firstBidTxHash: string | undefined
  triggeredAtBlock: number | undefined
  triggeredAt: string | undefined
  lastCheckedAt: string | undefined
  lastDecision: string
  stopReason: string | undefined
  lastError: string | undefined
  stoppedAt: string | undefined
  nextBidEth: string | undefined
  lastObservedAuction: WatcherTick | undefined
  blocksUntilTrigger: number | undefined
  triggerWindowReached: boolean | undefined
}
