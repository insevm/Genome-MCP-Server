import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseEther,
  formatEther,
  type Address,
  type Hex,
} from 'viem'
import { mainnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import {
  GENOME_CONTRACT,
  GENOME_ABI,
  UNISWAP_SWAP_ROUTER,
  UNISWAP_QUOTER_V2,
  WETH9,
  GENE_ETH_FEE,
  SWAP_ROUTER_ABI,
  QUOTER_V2_ABI,
} from '../config.js'
import { loadConfig } from '../store.js'
import { isInitialized } from '../bidder.js'
import { sanitizeRpcError, validatePositiveDecimal } from '../validate.js'

interface SwapGeneArgs {
  direction: 'buy' | 'sell'
  // buy:  ethAmount = exact ETH to spend  |  geneAmount = exact GENE to receive
  // sell: geneAmount = exact GENE to sell |  ethAmount = exact ETH to receive
  ethAmount?: string
  geneAmount?: string
  slippageBps?: number // basis points, default 50 (0.5 %)
  dryRun?: boolean
}

function applySlippage(amount: bigint, bps: number, direction: 'down' | 'up'): bigint {
  const factor = direction === 'down' ? 10_000n - BigInt(bps) : 10_000n + BigInt(bps)
  return (amount * factor) / 10_000n
}

export async function handleSwapGene(
  args: SwapGeneArgs,
  privateKey: Hex,
): Promise<object> {
  if (!isInitialized()) {
    throw new Error('Bidder not initialized. GENOME_BID_PASSWORD env var not set?')
  }

  const { direction, slippageBps = 50, dryRun } = args

  if (slippageBps < 0 || slippageBps > 10_000) {
    throw new Error(`slippageBps must be between 0 and 10000, got ${slippageBps}`)
  }

  if (args.ethAmount && args.geneAmount) {
    throw new Error('Provide either ethAmount or geneAmount, not both.')
  }
  if (!args.ethAmount && !args.geneAmount) {
    throw new Error('Provide either ethAmount or geneAmount.')
  }
  if (args.ethAmount) validatePositiveDecimal(args.ethAmount, 'ethAmount')
  if (args.geneAmount) validatePositiveDecimal(args.geneAmount, 'geneAmount')

  const config = await loadConfig()
  const account = privateKeyToAccount(privateKey)
  const walletAddress = account.address

  const publicClient = createPublicClient({ chain: mainnet, transport: http(config.rpcHttpUrl) })
  const walletClient = createWalletClient({ account, chain: mainnet, transport: http(config.rpcHttpUrl) })

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300) // 5 min

  // ── BUY: ETH → GENE ──────────────────────────────────────────────────────────

  try {
  if (direction === 'buy') {
    if (args.ethAmount) {
      // exactInputSingle: spend exact ETH, receive variable GENE
      const amountIn = parseEther(args.ethAmount)

      const [amountOut] = await publicClient.readContract({
        address: UNISWAP_QUOTER_V2,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: WETH9, tokenOut: GENOME_CONTRACT, amountIn, fee: GENE_ETH_FEE, sqrtPriceLimitX96: 0n }],
      }) as [bigint, bigint, number, bigint]

      const amountOutMin = applySlippage(amountOut, slippageBps, 'down')

      if (dryRun) {
        return {
          status: 'dry-run', direction, mode: 'exactInput',
          ethSpent: args.ethAmount,
          geneEstimated: formatEther(amountOut),
          geneMinimum: formatEther(amountOutMin),
          slippageBps,
        }
      }

      const data = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{ tokenIn: WETH9, tokenOut: GENOME_CONTRACT, fee: GENE_ETH_FEE, recipient: walletAddress, amountIn, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n }],
      })

      const txHash = await walletClient.sendTransaction({
        to: UNISWAP_SWAP_ROUTER,
        data,
        value: amountIn,
      })

      return {
        status: 'submitted', direction, mode: 'exactInput', txHash,
        ethSpent: args.ethAmount,
        geneEstimated: formatEther(amountOut),
        geneMinimum: formatEther(amountOutMin),
      }
    } else {
      // exactOutputSingle: receive exact GENE, spend variable ETH
      const amountOut = parseEther(args.geneAmount!)

      const [amountIn] = await publicClient.readContract({
        address: UNISWAP_QUOTER_V2,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactOutputSingle',
        args: [{ tokenIn: WETH9, tokenOut: GENOME_CONTRACT, amount: amountOut, fee: GENE_ETH_FEE, sqrtPriceLimitX96: 0n }],
      }) as [bigint, bigint, number, bigint]

      const amountInMax = applySlippage(amountIn, slippageBps, 'up')

      if (dryRun) {
        return {
          status: 'dry-run', direction, mode: 'exactOutput',
          geneReceived: args.geneAmount,
          ethEstimated: formatEther(amountIn),
          ethMaximum: formatEther(amountInMax),
          slippageBps,
        }
      }

      const exactOutputData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactOutputSingle',
        args: [{ tokenIn: WETH9, tokenOut: GENOME_CONTRACT, fee: GENE_ETH_FEE, recipient: walletAddress, amountOut, amountInMaximum: amountInMax, sqrtPriceLimitX96: 0n }],
      })
      const refundData = encodeFunctionData({ abi: SWAP_ROUTER_ABI, functionName: 'refundETH' })

      const multicallData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'multicall',
        args: [deadline, [exactOutputData, refundData]],
      })

      const txHash = await walletClient.sendTransaction({
        to: UNISWAP_SWAP_ROUTER,
        data: multicallData,
        value: amountInMax,
      })

      return {
        status: 'submitted', direction, mode: 'exactOutput', txHash,
        geneReceived: args.geneAmount,
        ethEstimated: formatEther(amountIn),
        ethMaximum: formatEther(amountInMax),
      }
    }
  }

  // ── SELL: GENE → ETH ─────────────────────────────────────────────────────────

  // Ensure SwapRouter allowance for GENE
  async function ensureAllowance(amount: bigint) {
    let allowance: bigint
    try {
      allowance = await publicClient.readContract({
        address: GENOME_CONTRACT,
        abi: GENOME_ABI,
        functionName: 'allowance',
        args: [walletAddress, UNISWAP_SWAP_ROUTER],
      }) as bigint
    } catch (err) {
      throw new Error(`Failed to read GENE allowance: ${sanitizeRpcError(err, config.rpcHttpUrl)}`)
    }

    if (allowance >= amount) return

    let approveTx: `0x${string}`
    try {
      approveTx = await walletClient.sendTransaction({
        to: GENOME_CONTRACT,
        data: encodeFunctionData({
          abi: GENOME_ABI,
          functionName: 'approve',
          args: [UNISWAP_SWAP_ROUTER, amount],
        }),
      })
      await publicClient.waitForTransactionReceipt({ hash: approveTx, timeout: 120_000 })
    } catch (err) {
      throw new Error(`GENE approve transaction failed: ${sanitizeRpcError(err, config.rpcHttpUrl)}`)
    }
  }

  if (args.geneAmount) {
    // exactInputSingle: sell exact GENE, receive variable ETH
    const amountIn = parseEther(args.geneAmount)

    const [amountOut] = await publicClient.readContract({
      address: UNISWAP_QUOTER_V2,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn: GENOME_CONTRACT, tokenOut: WETH9, amountIn, fee: GENE_ETH_FEE, sqrtPriceLimitX96: 0n }],
    }) as [bigint, bigint, number, bigint]

    const amountOutMin = applySlippage(amountOut, slippageBps, 'down')

    if (dryRun) {
      return {
        status: 'dry-run', direction, mode: 'exactInput',
        geneSold: args.geneAmount,
        ethEstimated: formatEther(amountOut),
        ethMinimum: formatEther(amountOutMin),
        slippageBps,
      }
    }

    await ensureAllowance(amountIn)

    const swapData = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{ tokenIn: GENOME_CONTRACT, tokenOut: WETH9, fee: GENE_ETH_FEE, recipient: UNISWAP_SWAP_ROUTER as Address, amountIn, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n }],
    })
    const unwrapData = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'unwrapWETH9',
      args: [amountOutMin, walletAddress],
    })

    const txHash = await walletClient.sendTransaction({
      to: UNISWAP_SWAP_ROUTER,
      data: encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'multicall',
        args: [deadline, [swapData, unwrapData]],
      }),
    })

    return {
      status: 'submitted', direction, mode: 'exactInput', txHash,
      geneSold: args.geneAmount,
      ethEstimated: formatEther(amountOut),
      ethMinimum: formatEther(amountOutMin),
    }
  } else {
    // exactOutputSingle: receive exact ETH, sell variable GENE
    const amountOut = parseEther(args.ethAmount!)

    const [amountIn] = await publicClient.readContract({
      address: UNISWAP_QUOTER_V2,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactOutputSingle',
      args: [{ tokenIn: GENOME_CONTRACT, tokenOut: WETH9, amount: amountOut, fee: GENE_ETH_FEE, sqrtPriceLimitX96: 0n }],
    }) as [bigint, bigint, number, bigint]

    const amountInMax = applySlippage(amountIn, slippageBps, 'up')

    if (dryRun) {
      return {
        status: 'dry-run', direction, mode: 'exactOutput',
        ethReceived: args.ethAmount,
        geneEstimated: formatEther(amountIn),
        geneMaximum: formatEther(amountInMax),
        slippageBps,
      }
    }

    await ensureAllowance(amountInMax)

    const swapData = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactOutputSingle',
      args: [{ tokenIn: GENOME_CONTRACT, tokenOut: WETH9, fee: GENE_ETH_FEE, recipient: UNISWAP_SWAP_ROUTER as Address, amountOut, amountInMaximum: amountInMax, sqrtPriceLimitX96: 0n }],
    })
    const unwrapData = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'unwrapWETH9',
      args: [amountOut, walletAddress],
    })

    const txHash = await walletClient.sendTransaction({
      to: UNISWAP_SWAP_ROUTER,
      data: encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'multicall',
        args: [deadline, [swapData, unwrapData]],
      }),
    })

    return {
      status: 'submitted', direction, mode: 'exactOutput', txHash,
      ethReceived: args.ethAmount,
      geneEstimated: formatEther(amountIn),
      geneMaximum: formatEther(amountInMax),
    }
  }
  } catch (err) {
    throw new Error(sanitizeRpcError(err, config.rpcHttpUrl))
  }
}
