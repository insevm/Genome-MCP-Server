import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  encodeFunctionData,
  parseEther,
  parseGwei,
  formatEther,
  type Hex,
  type Address,
} from 'viem'
import { mainnet } from 'viem/chains'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { GENOME_CONTRACT, GENOME_ABI, FLASHBOTS_RPC, BLOCK_PER_MINT } from './config.js'
import type { Config, WatcherTick } from './types.js'

export function generateWalletKey(): Hex {
  return generatePrivateKey()
}

export function getWalletAddress(privateKey: Hex): Address {
  return privateKeyToAccount(privateKey).address
}

export function makePublicClient(config: Config) {
  const transport = config.rpcWsUrl ? webSocket(config.rpcWsUrl) : http(config.rpcHttpUrl)
  return createPublicClient({ chain: mainnet, transport })
}

function makeWalletClient(config: Config, privateKey: Hex, useFlashbots = false) {
  const account = privateKeyToAccount(privateKey)
  const transport = useFlashbots ? http(FLASHBOTS_RPC) : http(config.rpcHttpUrl)
  return createWalletClient({ account, chain: mainnet, transport })
}

export async function sendBid(
  config: Config,
  privateKey: Hex,
  bidEth: string,
  opts: {
    usePrivateMempool?: boolean
    gasPriorityMultiplier?: number
    minPriorityFeeGwei?: number
    dryRun?: boolean
  } = {},
): Promise<string> {
  if (opts.dryRun) return `dry-run:bid:${bidEth}ETH`

  const walletClient = makeWalletClient(config, privateKey, opts.usePrivateMempool)
  const rpcUrl = opts.usePrivateMempool ? FLASHBOTS_RPC : config.rpcHttpUrl
  const publicClient = createPublicClient({ chain: mainnet, transport: http(rpcUrl) })

  const multiplier = opts.gasPriorityMultiplier ?? 1
  if (multiplier < 1 || multiplier > 20) {
    throw new Error(`gasPriorityMultiplier must be between 1 and 20, got ${multiplier}`)
  }
  let maxPriorityFeePerGas: bigint | undefined

  if (opts.minPriorityFeeGwei !== undefined) {
    // Fixed priority fee — skip estimateFeesPerGas entirely
    maxPriorityFeePerGas = parseGwei(opts.minPriorityFeeGwei.toString())
  } else if (multiplier > 1) {
    const fees = await publicClient.estimateFeesPerGas()
    const multiplierBps = BigInt(Math.round(multiplier * 100))
    maxPriorityFeePerGas = (fees.maxPriorityFeePerGas * multiplierBps) / 100n
  }

  const hash = await walletClient.sendTransaction({
    to: GENOME_CONTRACT,
    data: encodeFunctionData({ abi: GENOME_ABI, functionName: 'bidAndMint' }),
    value: parseEther(bidEth),
    gas: 300_000n,
    ...(maxPriorityFeePerGas !== undefined ? { maxPriorityFeePerGas } : {}),
  })

  return hash
}

export async function sendEthWithdrawal(
  config: Config,
  privateKey: Hex,
  toAddress: Address,
  amountEth: string,
  opts: { dryRun?: boolean } = {},
): Promise<string> {
  if (opts.dryRun) return `dry-run:withdraw-eth:${amountEth}ETH->${toAddress}`

  const walletClient = makeWalletClient(config, privateKey)
  return walletClient.sendTransaction({ to: toAddress, value: parseEther(amountEth) })
}

export async function sendGeneWithdrawal(
  config: Config,
  privateKey: Hex,
  toAddress: Address,
  amountGene: string,
  opts: { dryRun?: boolean } = {},
): Promise<string> {
  if (opts.dryRun) return `dry-run:withdraw-gene:${amountGene}GENE->${toAddress}`

  const walletClient = makeWalletClient(config, privateKey)
  return walletClient.sendTransaction({
    to: GENOME_CONTRACT,
    data: encodeFunctionData({
      abi: GENOME_ABI,
      functionName: 'transfer',
      args: [toAddress, parseEther(amountGene)],
    }),
  })
}

// Lean watcher tick: fetches only winner + minBidToOutbid + blockNumber (3 parallel calls).
// When deadlineBlock is 0 (first run or round reset), also fetches lastMintBlock to
// compute the deadline (4 parallel calls). Returns the updated deadlineBlock.
export async function getWatcherTick(
  config: Config,
  walletAddress: string,
  deadlineBlock: number,
): Promise<{ tick: WatcherTick; newDeadlineBlock: number }> {
  const client = makePublicClient(config)

  const base = [
    client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'winner' }),
    client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'minBidToOutbid' }),
    client.getBlockNumber(),
  ] as const

  if (deadlineBlock === 0) {
    const [winnerRaw, minBidRaw, blockRaw, lastMintRaw] = await Promise.all([
      ...base,
      client.readContract({ address: GENOME_CONTRACT, abi: GENOME_ABI, functionName: 'lastMintBlock' }),
    ])
    const winner = winnerRaw as string
    const cur = Number(blockRaw as bigint)
    const newDeadlineBlock = Number(lastMintRaw as bigint) + Number(BLOCK_PER_MINT)
    return {
      tick: {
        winner,
        minBidToOutbid: formatEther(minBidRaw as bigint),
        currentBlock: cur,
        blocksRemaining: Math.max(0, newDeadlineBlock - cur),
        isUserWinning: winner.toLowerCase() === walletAddress.toLowerCase(),
      },
      newDeadlineBlock,
    }
  }

  const [winnerRaw, minBidRaw, blockRaw] = await Promise.all(base)
  const winner = winnerRaw as string
  const cur = Number(blockRaw as bigint)
  return {
    tick: {
      winner,
      minBidToOutbid: formatEther(minBidRaw as bigint),
      currentBlock: cur,
      blocksRemaining: Math.max(0, deadlineBlock - cur),
      isUserWinning: winner.toLowerCase() === walletAddress.toLowerCase(),
    },
    newDeadlineBlock: deadlineBlock,
  }
}

export { formatEther, parseEther }
