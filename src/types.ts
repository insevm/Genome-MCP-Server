export interface Config {
  walletAddress: string
  genomeContract: string
  chainId: number
  rpcWsUrl?: string
  rpcHttpUrl: string
  defaults: {
    maxEth: string
    leadBlocks: number
    gasStrategy: 'normal' | 'fast'
    snipe: {
      triggerBlocks: number
      gasPriorityMultiplier: number
      usePrivateMempool: boolean
    }
  }
}

export interface BidEvent {
  type: 'bid_placed' | 'max_eth_exceeded' | 'error'
  strategy: 'auto-bid' | 'snipe'
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
  tokenId: number
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

export interface AutoBidConfig {
  maxEth: string
  leadBlocks: number
  gasStrategy: 'normal' | 'fast'
  dryRun: boolean
}

export interface SnipeConfig {
  maxEth: string
  triggerBlocks: number
  gasPriorityMultiplier: number
  usePrivateMempool: boolean
  dryRun: boolean
}
