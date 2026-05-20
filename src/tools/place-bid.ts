import { createPublicClient, http, formatEther, parseEther } from 'viem'
import { mainnet } from 'viem/chains'
import { getAuctionStatus, isInitialized } from '../bidder.js'
import { GENOME_ABI, GENOME_CONTRACT } from '../config.js'
import { appendBidRecord, loadConfig } from '../store.js'
import type { AuctionStatus, BidRecord } from '../types.js'
import { validatePositiveDecimal, sanitizeRpcError } from '../validate.js'
import { sendBid } from '../wallet.js'

interface PlaceBidArgs {
  bidEth: string
  usePrivateMempool?: boolean
  gasPriorityMultiplier?: number
  dryRun?: boolean
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export async function handlePlaceBid(
  args: PlaceBidArgs,
  privateKey: `0x${string}`,
): Promise<object> {
  if (!isInitialized()) {
    throw new Error(
      'Bidder not initialized. Make sure GENOME_BID_PASSWORD is set in the MCP server env.',
    )
  }

  validatePositiveDecimal(args.bidEth, 'bidEth')

  if (
    args.gasPriorityMultiplier !== undefined
    && (!Number.isFinite(args.gasPriorityMultiplier)
      || args.gasPriorityMultiplier < 1
      || args.gasPriorityMultiplier > 20)
  ) {
    throw new Error('gasPriorityMultiplier must be a number between 1 and 20')
  }

  const config = await loadConfig()
  const publicClient = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })

  let status: AuctionStatus
  try {
    status = await getAuctionStatus(config, config.walletAddress)
  } catch (err: unknown) {
    throw new Error(`Failed to read auction status: ${sanitizeRpcError(err, config.rpcHttpUrl)}`)
  }

  let requiredMinimumBidEth = status.minBidToOutbid
  let auctionContext = 'active-auction'
  let biddingForTokenId = status.latestTokenId

  if (status.blocksRemaining <= 0) {
    let minBidWei: bigint
    try {
      minBidWei = await publicClient.readContract({
        address: GENOME_CONTRACT,
        abi: GENOME_ABI,
        functionName: 'MIN_BID',
      }) as bigint
    } catch (err: unknown) {
      throw new Error(`Failed to read MIN_BID: ${sanitizeRpcError(err, config.rpcHttpUrl)}`)
    }

    requiredMinimumBidEth = formatEther(minBidWei)

    if (status.winner.toLowerCase() === ZERO_ADDRESS) {
      auctionContext = 'settled-round-without-leading-bid'
      biddingForTokenId = status.latestTokenId
    } else {
      auctionContext = 'new-round-after-settling-expired-auction'
      biddingForTokenId = status.latestTokenId + 1
    }
  }

  if (parseEther(args.bidEth) < parseEther(requiredMinimumBidEth)) {
    throw new Error(
      `bidEth ${args.bidEth} ETH is below the current required minimum ` +
      `${requiredMinimumBidEth} ETH for ${auctionContext}`,
    )
  }

  const txHash = await sendBid(config, privateKey, args.bidEth, {
    usePrivateMempool: args.usePrivateMempool,
    gasPriorityMultiplier: args.gasPriorityMultiplier,
    dryRun: args.dryRun,
  })

  if (!args.dryRun) {
    const record: BidRecord = {
      walletAddress: config.walletAddress,
      timestamp: new Date().toISOString(),
      txHash,
      bidEth: args.bidEth,
      tokenId: biddingForTokenId,
      result: 'pending',
    }
    await appendBidRecord(record)
  }

  return {
    status: args.dryRun ? 'dry-run' : 'submitted',
    txHash,
    walletAddress: config.walletAddress,
    bidEth: args.bidEth,
    biddingForTokenId,
    requiredMinimumBidEth,
    auctionContext,
    usePrivateMempool: args.usePrivateMempool ?? false,
    gasPriorityMultiplier: args.gasPriorityMultiplier ?? 1,
    observedAuction: status,
    note:
      status.blocksRemaining <= 0
        ? 'The observed auction already appears expired, so this call will execute through the contract\'s lazy-settlement path.'
        : undefined,
  }
}
