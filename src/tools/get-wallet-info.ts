import { createPublicClient, http, formatEther, type Address } from 'viem'
import { mainnet } from 'viem/chains'
import { loadConfig } from '../store.js'

export async function handleGetWalletInfo(): Promise<object> {
  const config = await loadConfig()

  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })
  const balanceWei = await client.getBalance({ address: config.kernelAddress as Address })

  const expiresAt = new Date(config.sessionKeyExpiresAt)
  const now = new Date()
  const daysRemaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  )

  return {
    kernelAddress: config.kernelAddress,
    balanceEth: formatEther(balanceWei),
    sessionKey: {
      address: config.sessionKeyAddress,
      expiresAt: config.sessionKeyExpiresAt,
      daysRemaining,
      policies: {
        maxPerTx: config.defaults.maxEth,
        allowedContract: config.genomeContract,
        allowedFunction: 'bidAndMint()',
      },
    },
  }
}
