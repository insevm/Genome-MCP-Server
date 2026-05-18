import { createPublicClient, http, formatEther, parseEther, type Address } from 'viem'
import { mainnet } from 'viem/chains'
import { sendGeneWithdrawal } from '../kernel.js'
import { loadConfig } from '../store.js'
import { isInitialized } from '../bidder.js'
import { GENOME_CONTRACT, GENOME_ABI } from '../config.js'

interface WithdrawGeneArgs {
  toAddress: string
  amountGene: string  // e.g. "100" or "all" — 1 GENE = 10^18 units
  dryRun?: boolean
}

export async function handleWithdrawGene(
  args: WithdrawGeneArgs,
  sessionPrivateKey: `0x${string}`,
): Promise<object> {
  if (!isInitialized()) {
    throw new Error('Bidder not initialized. GENOME_BID_PASSWORD env var not set?')
  }

  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })

  // balanceOf = balancesOfFT + sum of balancesOfNFT[tokenId] for all owned NFTs.
  // transfer() uses liquid FT first, then co-transfers NFTs to cover the remainder.
  const totalBalanceRaw = await client.readContract({
    address: GENOME_CONTRACT,
    abi: GENOME_ABI,
    functionName: 'balanceOf',
    args: [config.kernelAddress as Address],
  }) as bigint

  let amountGene = args.amountGene
  if (amountGene === 'all') {
    if (totalBalanceRaw === 0n) {
      throw new Error('No GENE balance in Kernel account')
    }
    amountGene = formatEther(totalBalanceRaw)
  }

  const requestedRaw = parseEther(amountGene)
  if (requestedRaw > totalBalanceRaw) {
    throw new Error(
      `Requested ${amountGene} GENE but total balance is only ${formatEther(totalBalanceRaw)} GENE`,
    )
  }

  const txHash = await sendGeneWithdrawal(
    config,
    sessionPrivateKey,
    args.toAddress as Address,
    amountGene,
    { dryRun: args.dryRun },
  )

  return {
    status: args.dryRun ? 'dry-run' : 'submitted',
    txHash,
    amountGene,
    toAddress: args.toAddress,
    kernelAddress: config.kernelAddress,
    totalBalanceBefore: formatEther(totalBalanceRaw),
    note: 'Liquid FT is consumed first; NFTs are co-transferred if needed to cover the amount. If recipient holds ≥10 NFTs, those NFTs\' GENE will be burned instead of transferred.',
  }
}
