import { createPublicClient, http, formatEther, parseEther, parseAbiItem } from 'viem'
import { mainnet } from 'viem/chains'
import { loadConfig } from '../store.js'
import {
  GENOME_CONTRACT,
  GENOME_ABI,
  GENE_WETH_POOL,
  UNISWAP_QUOTER_V2,
  QUOTER_V2_ABI,
  WETH9,
} from '../config.js'

// Halving schedule: Era 0 → 5000 GENE/NFT, halves every 2100 NFTs
const GENE_PER_NFT_ERA0_WEI = parseEther('5000')
const EPOCH_LENGTH = 2100n

// Operate in wei to preserve fractional GENE (e.g., Era 9 = 9.765625 GENE)
function geneEmbeddedWei(tokenId: bigint): bigint {
  const era = tokenId / EPOCH_LENGTH
  if (era >= 10n) return 0n
  return GENE_PER_NFT_ERA0_WEI >> era
}

const POOL_FEE_ABI = [parseAbiItem('function fee() view returns (uint24)')]

export async function handleGetFloorPrice(): Promise<object> {
  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })

  // Fetch current state and pool fee tier in parallel
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

  // The *next* mint will be tokenId + 1 (current latestTokenId has already been minted)
  const nextTokenId = latestTokenId + 1n
  const era = nextTokenId / EPOCH_LENGTH
  const embeddedWei = geneEmbeddedWei(nextTokenId)

  if (embeddedWei === 0n) {
    return { error: 'All 21,000 NFTs have been minted. GENE issuance is complete.' }
  }

  // Quote: sell embeddedWei GENE → WETH at current pool price (includes price impact)
  let ethOutWei: bigint
  try {
    const result = await client.readContract({
      address: UNISWAP_QUOTER_V2,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn:         GENOME_CONTRACT,
        tokenOut:        WETH9,
        amountIn:        embeddedWei,
        fee:             poolFee,
        sqrtPriceLimitX96: 0n,
      }],
    }) as [bigint, bigint, number, bigint]
    ethOutWei = result[0]
  } catch (err: unknown) {
    const raw  = err instanceof Error ? err.message : String(err)
    const safe = raw.replace(/https?:\/\/[^\s"']*/g, '<rpc-url>')
    return { error: `Uniswap quote failed: ${safe}` }
  }

  // ETH per 1 GENE = ethOutWei * 1e18 / embeddedWei  (result in wei, then format)
  const genePriceWei = (ethOutWei * 10n ** 18n) / embeddedWei

  return {
    // NFT context
    nextTokenId:   Number(nextTokenId),
    currentEra:    Number(era),
    minted:        Number(latestTokenId),
    remaining:     21000 - Number(latestTokenId),

    // GENE embedded in the next NFT
    geneEmbedded:     formatEther(embeddedWei) + ' GENE',
    geneEmbeddedNote: `Era ${era}: each NFT minted now contains ${formatEther(embeddedWei)} GENE`,

    // Uniswap price
    poolAddress:   GENE_WETH_POOL,
    poolFeeTier:   `${poolFee / 10_000}%`,
    genePriceEth:  formatEther(genePriceWei) + ' ETH per GENE',

    // Floor price = ETH you'd recover by selling all embedded GENE immediately after mint
    floorPriceEth: formatEther(ethOutWei),
    interpretation: [
      `Bidding ${formatEther(ethOutWei)} ETH or less is risk-free: if you win, ` +
      `you can sell the ${formatEther(embeddedWei)} GENE inside the NFT on Uniswap ` +
      `and fully recover your bid cost.`,
      `Bidding above ${formatEther(ethOutWei)} ETH requires conviction that the NFT's ` +
      `hold value or future GENE price appreciation justifies the premium.`,
    ],
  }
}
