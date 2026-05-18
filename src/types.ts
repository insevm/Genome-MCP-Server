export interface Config {
  kernelAddress: string
  sessionKeyAddress: string
  sessionKeyExpiresAt: string
  genomeContract: string
  chainId: number
  rpcWsUrl: string
  rpcHttpUrl: string
  zeroDev: {
    projectId: string
    bundlerUrl: string
  }
  defaults: {
    maxEth: string
    incrementEth: string
    leadBlocks: number
    gasStrategy: 'normal' | 'fast'
    snipe: {
      triggerBlocks: number
      gasPriorityMultiplier: number
      usePrivateMempool: boolean
    }
  }
}

export interface BidRecord {
  timestamp: string
  txHash: string
  bidEth: string
  tokenId: number
  result: 'won' | 'outbid' | 'pending'
}

export interface AuctionStatus {
  currentBlock: number
  latestTokenId: number
  winner: string
  topBid: string
  lastMintBlock: number
  deadlineBlock: number
  blocksRemaining: number
  isUserWinning: boolean
}

export interface AutoBidConfig {
  maxEth: string
  incrementEth: string
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
