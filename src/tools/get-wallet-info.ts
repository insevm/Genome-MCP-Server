import { createPublicClient, http, formatEther, type Address } from 'viem'
import { mainnet } from 'viem/chains'
import { loadConfig } from '../store.js'
import { GENOME_CONTRACT, GENOME_ABI } from '../config.js'

export async function handleGetWalletInfo(): Promise<object> {
  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })

  const [balanceWei, geneBalanceRaw] = await Promise.all([
    client.getBalance({ address: config.walletAddress as Address }),
    client.readContract({
      address: GENOME_CONTRACT,
      abi: GENOME_ABI,
      functionName: 'balanceOf',
      args: [config.walletAddress as Address],
    }) as Promise<bigint>,
  ])

  return {
    walletAddress: config.walletAddress,
    balanceEth: formatEther(balanceWei),
    balanceGene: formatEther(geneBalanceRaw),
    defaults: config.defaults,
  }
}
