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
import { GENOME_CONTRACT, GENOME_ABI, FLASHBOTS_RPC } from './config.js'
import type { Config } from './types.js'

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

  if (multiplier > 1 || opts.minPriorityFeeGwei !== undefined) {
    const fees = await publicClient.estimateFeesPerGas()
    const multiplierBps = BigInt(Math.round(multiplier * 100))
    maxPriorityFeePerGas = (fees.maxPriorityFeePerGas * multiplierBps) / 100n

    if (opts.minPriorityFeeGwei !== undefined) {
      const minWei = parseGwei(opts.minPriorityFeeGwei.toString())
      if (maxPriorityFeePerGas < minWei) maxPriorityFeePerGas = minWei
    }
  }

  const hash = await walletClient.sendTransaction({
    to: GENOME_CONTRACT,
    data: encodeFunctionData({ abi: GENOME_ABI, functionName: 'bidAndMint' }),
    value: parseEther(bidEth),
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

export { formatEther, parseEther }
