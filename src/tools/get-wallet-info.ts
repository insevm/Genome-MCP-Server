import { createPublicClient, http, formatEther, type Address } from 'viem'
import { mainnet } from 'viem/chains'
import { loadConfig } from '../store.js'
import { GENOME_CONTRACT, GENOME_ABI } from '../config.js'
import { sanitizeRpcError } from '../validate.js'

export async function handleGetWalletInfo(): Promise<object> {
  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })

  let balanceWei: bigint
  let geneBalanceRaw: bigint
  try {
    ;[balanceWei, geneBalanceRaw] = await Promise.all([
      client.getBalance({ address: config.walletAddress as Address }),
      client.readContract({
        address: GENOME_CONTRACT,
        abi: GENOME_ABI,
        functionName: 'balanceOf',
        args: [config.walletAddress as Address],
      }) as Promise<bigint>,
    ])
  } catch (err) {
    throw new Error(`Failed to read wallet balances: ${sanitizeRpcError(err, config.rpcHttpUrl)}`)
  }

  return {
    walletAddress: config.walletAddress,
    balanceEth: formatEther(balanceWei),
    balanceGene: formatEther(geneBalanceRaw),
    defaults: config.defaults,
  }
}
