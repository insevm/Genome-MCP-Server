import { createPublicClient, http, formatEther, parseEther, type Address } from 'viem'
import { mainnet } from 'viem/chains'
import { sendEthWithdrawal } from '../wallet.js'
import { loadConfig } from '../store.js'
import { isInitialized } from '../bidder.js'
import { validateAddress, validatePositiveDecimal } from '../validate.js'

interface WithdrawEthArgs {
  toAddress: string
  amountEth: string
  dryRun?: boolean
}

const GAS_BUFFER_ETH = '0.005'

export async function handleWithdrawEth(
  args: WithdrawEthArgs,
  privateKey: `0x${string}`,
): Promise<object> {
  if (!isInitialized()) {
    throw new Error('Bidder not initialized. GENOME_BID_PASSWORD env var not set?')
  }

  validateAddress(args.toAddress, 'toAddress')
  validatePositiveDecimal(args.amountEth, 'amountEth')

  const config = await loadConfig()
  const client = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })
  const balance = await client.getBalance({ address: config.walletAddress as Address })

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
      `Requested ${amountEth} ETH but wallet balance is only ${formatEther(balance)} ETH`,
    )
  }

  const txHash = await sendEthWithdrawal(config, privateKey, args.toAddress as Address, amountEth, {
    dryRun: args.dryRun,
  })

  return {
    status: args.dryRun ? 'dry-run' : 'submitted',
    txHash,
    amountEth,
    toAddress: args.toAddress,
    walletAddress: config.walletAddress,
    balanceBefore: formatEther(balance),
  }
}
