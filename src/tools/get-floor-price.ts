import { createPublicClient, http, formatEther, parseEther, parseAbiItem } from 'viem'
import { mainnet } from 'viem/chains'
import { loadConfig } from '../store.js'
import { sanitizeRpcError } from '../validate.js'
import {
  GENOME_CONTRACT,
  GENOME_ABI,
  GENE_WETH_POOL,
  UNISWAP_QUOTER_V2,
  QUOTER_V2_ABI,
  WETH9,
} from '../config.js'

// Total GENE minted per NFT in Era 0. Halves every epoch per the halving schedule.
// Era 0 only: 50% goes to TokenLocker (LP), 50% goes to the NFT holder.
// Era 1+: 100% goes to the NFT holder — no LP split from Epoch 1 onward.
const GENE_PER_NFT_TOTAL_ERA0_WEI = parseEther('5000')
const EPOCH_LENGTH = 2100n
const MAX_ERA = 10n          // EPOCH_LENGTH * MAX_ERA = 21,000 total NFTs
const MAX_TOKEN_ID = 21_000  // hard cap

function geneEmbeddedWei(tokenId: bigint): bigint {
  const era = tokenId / EPOCH_LENGTH
  if (era >= MAX_ERA) return 0n
  const totalForEra = GENE_PER_NFT_TOTAL_ERA0_WEI >> era
  return era === 0n ? totalForEra / 2n : totalForEra
}

const POOL_FEE_ABI = [parseAbiItem('function fee() view returns (uint24)')]

async function fetchPoolState(client: ReturnType<typeof createPublicClient>, rpcUrl: string) {
  try {
    const [latestTokenId, poolFee] = await Promise.all([
      client.readContract({
        address: GENOME_CONTRACT,
        abi: GENOME_ABI,
        functionName: 'latestTokenId',
      }) as Promise<bigint>,
      client.readContract({
        address: GENE_WETH_POOL,
        abi: POOL_FEE_ABI,
        functionName: 'fee',
      }) as Promise<number>,
    ])
    return { latestTokenId, poolFee }
  } catch (err: unknown) {
    throw new Error(`Failed to read contract state: ${sanitizeRpcError(err, rpcUrl)}`)
  }
}

async function quoteGeneToEth(
  client: ReturnType<typeof createPublicClient>,
  embeddedWei: bigint,
  poolFee: number,
  rpcUrl: string,
): Promise<bigint> {
  try {
    const result = await client.readContract({
      address: UNISWAP_QUOTER_V2,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn: GENOME_CONTRACT, tokenOut: WETH9, amountIn: embeddedWei, fee: poolFee, sqrtPriceLimitX96: 0n }],
    }) as [bigint, bigint, number, bigint]
    return result[0]
  } catch (err: unknown) {
    throw new Error(`Uniswap quote failed: ${sanitizeRpcError(err, rpcUrl)}`)
  }
}

export async function handleGetFloorPrice(): Promise<object> {
  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })

  let latestTokenId: bigint
  let poolFee: number
  try {
    ;({ latestTokenId, poolFee } = await fetchPoolState(client, config.rpcHttpUrl))
  } catch (err: unknown) {
    throw err
  }

  if (poolFee === 0) {
    throw new Error('Pool fee tier is zero — the pool address may be incorrect.')
  }

  const nextTokenId = latestTokenId + 1n
  const era = nextTokenId / EPOCH_LENGTH
  const embeddedWei = geneEmbeddedWei(nextTokenId)

  if (embeddedWei === 0n) {
    throw new Error('All 21,000 NFTs have been minted. GENE issuance is complete.')
  }

  const totalMintedWei = GENE_PER_NFT_TOTAL_ERA0_WEI >> era
  const lpWei = totalMintedWei - embeddedWei  // 0 for era 1+

  let ethOutWei: bigint
  try {
    ethOutWei = await quoteGeneToEth(client, embeddedWei, poolFee, config.rpcHttpUrl)
  } catch (err: unknown) {
    throw err
  }

  const genePriceWei = (ethOutWei * 10n ** 18n) / embeddedWei

  const embeddedNote = era === 0n
    ? `Era 0: each mint produces ${formatEther(totalMintedWei)} GENE total — ${formatEther(embeddedWei)} GENE goes to the NFT holder (recoverable), ${formatEther(lpWei)} GENE goes to the liquidity pool (50/50 split, Epoch 0 only).`
    : `Era ${Number(era)}: each mint produces ${formatEther(totalMintedWei)} GENE total — all ${formatEther(embeddedWei)} GENE goes to the NFT holder (recoverable). No LP split from Era 1 onward.`

  return {
    nextTokenId:      Number(nextTokenId),
    currentEra:       Number(era),
    minted:           Number(latestTokenId),
    remaining:        MAX_TOKEN_ID - Number(latestTokenId),
    geneEmbedded:     formatEther(embeddedWei) + ' GENE',
    geneEmbeddedNote: embeddedNote,
    poolAddress:      GENE_WETH_POOL,
    poolFeeTier:      `${poolFee / 10_000}%`,
    genePriceEth:     formatEther(genePriceWei) + ' ETH per GENE',
    pricingMethod:    'spot Uniswap V3 quote for immediately selling the embedded GENE',
    spotRecoveryEth:  formatEther(ethOutWei),
    floorPriceEth:    formatEther(ethOutWei),
    caveats: [
      'This is a spot estimate based on the current Uniswap pool quote.',
      'It does not include bid gas, approval gas, swap gas, or any marketplace/exit costs.',
      'It also does not account for slippage from your actual sell size or price movement after you win the auction.',
    ],
    interpretation: [
      `The current spot estimate suggests roughly ${formatEther(ethOutWei)} ETH could be recovered by immediately selling the ${formatEther(embeddedWei)} GENE embedded in the next NFT.`,
      `Treat ${formatEther(ethOutWei)} ETH as a reference point rather than a guaranteed risk-free floor, because real recovery depends on gas costs, slippage, and future pool prices.`,
    ],
  }
}
