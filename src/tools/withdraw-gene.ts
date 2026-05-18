import { createPublicClient, http, formatEther, parseEther, type Address } from 'viem'
import { mainnet } from 'viem/chains'
import { sendGeneWithdrawal } from '../wallet.js'
import { loadConfig } from '../store.js'
import { isInitialized } from '../bidder.js'
import { GENOME_CONTRACT, GENOME_ABI } from '../config.js'
import { validateAddress, validatePositiveDecimal } from '../validate.js'

interface WithdrawGeneArgs {
  toAddress: string
  amountGene: string
  dryRun?: boolean
}

export async function handleWithdrawGene(
  args: WithdrawGeneArgs,
  privateKey: `0x${string}`,
): Promise<object> {
  if (!isInitialized()) {
    throw new Error('Bidder not initialized. GENOME_BID_PASSWORD env var not set?')
  }

  validateAddress(args.toAddress, 'toAddress')
  validatePositiveDecimal(args.amountGene, 'amountGene')

  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })

  const totalBalanceRaw = await client.readContract({
    address: GENOME_CONTRACT,
    abi: GENOME_ABI,
    functionName: 'balanceOf',
    args: [config.walletAddress as Address],
  }) as bigint

  let amountGene = args.amountGene
  if (amountGene === 'all') {
    if (totalBalanceRaw === 0n) throw new Error('No GENE balance in wallet')
    amountGene = formatEther(totalBalanceRaw)
  }

  const requestedRaw = parseEther(amountGene)
  if (requestedRaw > totalBalanceRaw) {
    throw new Error(
      `Requested ${amountGene} GENE but total balance is only ${formatEther(totalBalanceRaw)} GENE`,
    )
  }

  const txHash = await sendGeneWithdrawal(config, privateKey, args.toAddress as Address, amountGene, {
    dryRun: args.dryRun,
  })

  return {
    status: args.dryRun ? 'dry-run' : 'submitted',
    txHash,
    amountGene,
    toAddress: args.toAddress,
    walletAddress: config.walletAddress,
    totalBalanceBefore: formatEther(totalBalanceRaw),
    note: 'Liquid FT is consumed first; NFTs are co-transferred if needed to cover the amount.',
  }
}
