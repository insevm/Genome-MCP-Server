import { createPublicClient, http, formatEther, parseEther, type Address } from 'viem'
import { mainnet } from 'viem/chains'
import { sendEthWithdrawal } from '../kernel.js'
import { loadConfig } from '../store.js'
import { isInitialized } from '../bidder.js'

interface WithdrawEthArgs {
  toAddress: string
  amountEth: string  // e.g. "0.1" or "all"
  dryRun?: boolean
}

const GAS_BUFFER_ETH = '0.005' // reserve for gas when withdrawing "all"

export async function handleWithdrawEth(
  args: WithdrawEthArgs,
  sessionPrivateKey: `0x${string}`,
): Promise<object> {
  if (!isInitialized()) {
    throw new Error('Bidder not initialized. GENOME_BID_PASSWORD env var not set?')
  }

  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })
  const balance = await client.getBalance({ address: config.kernelAddress as Address })

  let amountEth = args.amountEth
  if (amountEth === 'all') {
    const buffer = parseEther(GAS_BUFFER_ETH)
    if (balance <= buffer) {
      throw new Error(
        `Balance too low to withdraw (${formatEther(balance)} ETH). Minimum gas buffer: ${GAS_BUFFER_ETH} ETH`,
      )
    }
    amountEth = formatEther(balance - buffer)
  }

  if (parseEther(amountEth) > balance) {
    throw new Error(
      `Requested ${amountEth} ETH but Kernel balance is only ${formatEther(balance)} ETH`,
    )
  }

  const txHash = await sendEthWithdrawal(
    config,
    sessionPrivateKey,
    args.toAddress as Address,
    amountEth,
    { dryRun: args.dryRun },
  )

  return {
    status: args.dryRun ? 'dry-run' : 'submitted',
    txHash,
    amountEth,
    toAddress: args.toAddress,
    kernelAddress: config.kernelAddress,
    balanceBefore: formatEther(balance),
  }
}
