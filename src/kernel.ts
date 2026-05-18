/**
 * ZeroDev Kernel v5 integration.
 * Packages: @zerodev/sdk ^5.3, @zerodev/ecdsa-validator ^5.3, @zerodev/permissions ^5.4
 *
 * Setup flow  (runs once, inside setup.ts):
 *   Owner (MetaMask) signs a UserOperation that enables the permission validator on-chain.
 *   CLI computes the UserOp + EIP-712 hash, browser signs it, CLI submits to the bundler.
 *
 * Runtime flow (runs on every MCP call that needs to bid):
 *   Load encrypted session key → rebuild permission validator with same policies → send UserOp.
 */

import {
  createPublicClient,
  http,
  webSocket,
  encodeFunctionData,
  parseEther,
  formatEther,
  zeroAddress,
  type Hex,
  type Address,
} from 'viem'
import { mainnet } from 'viem/chains'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { createKernelAccount, createKernelAccountClient } from '@zerodev/sdk'
import { KERNEL_V3_1 } from '@zerodev/sdk/constants'
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { toPermissionValidator } from '@zerodev/permissions'
import { toCallPolicy, CallPolicyVersion, Operation } from '@zerodev/permissions/policies'
import { ENTRYPOINT_ADDRESS_V07 } from 'permissionless'
import { GENOME_CONTRACT, GENOME_ABI, FLASHBOTS_RPC } from './config.js'
import type { Config } from './types.js'

export function generateSessionKey(): Hex {
  return generatePrivateKey()
}

export function getSessionKeyAddress(privateKey: Hex): Address {
  return privateKeyToAccount(privateKey).address
}

export function makePublicClient(config: Config) {
  const transport = config.rpcWsUrl
    ? webSocket(config.rpcWsUrl)
    : http(config.rpcHttpUrl)
  return createPublicClient({ chain: mainnet, transport })
}

/**
 * Build all call policies for the session key.
 * Returns an array — ZeroDev ORs them, so a call is allowed if it matches any policy.
 *
 * Three policy groups:
 *  1. bidAndMint on Genome — ETH value limited to maxBidEth per tx
 *  2. transfer on Genome — for GENE ERC20 withdrawals (no ETH value)
 *  3. Plain ETH transfer to any address — for native ETH withdrawals
 *     Uses zeroAddress as the "any target" wildcard; maxBidEth also caps each withdrawal.
 */
function buildAllPolicies(maxBidEth: string) {
  const genomePolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_1,
    permissions: [
      {
        abi: GENOME_ABI,
        target: GENOME_CONTRACT,
        functionName: 'bidAndMint',
        operation: Operation.Call,
        valueLimit: parseEther(maxBidEth),
      },
      {
        abi: GENOME_ABI,
        target: GENOME_CONTRACT,
        functionName: 'transfer',
        operation: Operation.Call,
        valueLimit: 0n, // no ETH value for ERC20 transfer
      },
    ],
  })

  // Allow sending native ETH to any address — used by withdraw_eth.
  // zeroAddress as target acts as a wildcard in ZeroDev v5 call policies.
  // valueLimit re-uses maxBidEth to cap per-tx withdrawal amount.
  const ethTransferPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_1,
    permissions: [
      {
        target: zeroAddress,
        operation: Operation.Call,
        valueLimit: parseEther(maxBidEth),
      },
    ],
  })

  return [genomePolicy, ethTransferPolicy]
}

/**
 * Used during setup: compute the Kernel address for a given owner (MetaMask address).
 * We pass an empty account that can only provide the address (no signing needed here).
 */
export async function computeKernelAddress(
  ownerAddress: Address,
  rpcHttpUrl: string,
): Promise<Address> {
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcHttpUrl),
  })

  // addressToEmptyAccount lets ZeroDev compute the deterministic address without a real signer
  const { addressToEmptyAccount } = await import('viem')
  const ownerAccount = addressToEmptyAccount(ownerAddress)

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerAccount as Parameters<typeof signerToEcdsaValidator>[1]['signer'],
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    kernelVersion: KERNEL_V3_1,
  })

  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    kernelVersion: KERNEL_V3_1,
  })

  return kernelAccount.address
}

/**
 * Build the UserOperation that enables the permission validator on the Kernel account.
 * Returns the UserOp + EIP-712 typed data for the browser to sign via MetaMask.
 */
export async function buildEnableSessionKeyUserOp(
  ownerAddress: Address,
  sessionPrivateKey: Hex,
  maxBidEth: string,
  validUntilSecs: number,
  config: Pick<Config, 'rpcHttpUrl' | 'zeroDev'>,
): Promise<{ userOp: object; typedData: object; kernelAddress: Address }> {
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(config.rpcHttpUrl),
  })

  const { addressToEmptyAccount } = await import('viem')
  const ownerAccount = addressToEmptyAccount(ownerAddress)

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerAccount as Parameters<typeof signerToEcdsaValidator>[1]['signer'],
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    kernelVersion: KERNEL_V3_1,
  })

  const sessionKeySigner = privateKeyToAccount(sessionPrivateKey)
  const policies = buildAllPolicies(maxBidEth)

  const permissionValidator = await toPermissionValidator(publicClient, {
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    signer: sessionKeySigner,
    policies,
    kernelVersion: KERNEL_V3_1,
    validUntil: validUntilSecs,
  })

  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator, regular: permissionValidator },
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    kernelVersion: KERNEL_V3_1,
  })

  const kernelClient = createKernelAccountClient({
    account: kernelAccount,
    chain: mainnet,
    bundlerTransport: http(config.zeroDev.bundlerUrl),
  })

  // Build (but don't sign) the UserOperation for enabling the permission validator
  const userOp = await kernelClient.prepareUserOperation({
    calls: [
      {
        to: kernelAccount.address,
        data: await kernelAccount.getEnableData(permissionValidator),
        value: 0n,
      },
    ],
  })

  const userOpHash = await kernelClient.getUserOperationHash(userOp)

  const typedData = {
    domain: { name: 'Kernel', version: '0.3.1', chainId: 1 },
    types: {
      UserOperationHash: [{ name: 'hash', type: 'bytes32' }],
    },
    primaryType: 'UserOperationHash',
    message: { hash: userOpHash },
  }

  return { userOp, typedData, kernelAddress: kernelAccount.address }
}

/**
 * Runtime: rebuild the kernel account client using only the session key.
 * No MetaMask needed.
 */
export async function makeSessionKernelClient(
  config: Config,
  sessionPrivateKey: Hex,
) {
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(config.rpcHttpUrl),
  })

  const sessionKeySigner = privateKeyToAccount(sessionPrivateKey)
  const policies = buildAllPolicies(config.defaults.maxEth)

  const permissionValidator = await toPermissionValidator(publicClient, {
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    signer: sessionKeySigner,
    policies,
    kernelVersion: KERNEL_V3_1,
  })

  const kernelAccount = await createKernelAccount(publicClient, {
    address: config.kernelAddress as Address,
    plugins: { regular: permissionValidator },
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    kernelVersion: KERNEL_V3_1,
  })

  return createKernelAccountClient({
    account: kernelAccount,
    chain: mainnet,
    bundlerTransport: http(config.zeroDev.bundlerUrl),
  })
}

/**
 * Send a bidAndMint UserOperation.
 * Returns the tx/UserOp hash.
 */
export async function sendBid(
  config: Config,
  sessionPrivateKey: Hex,
  bidEth: string,
  opts: {
    usePrivateMempool?: boolean
    gasPriorityMultiplier?: number
    dryRun?: boolean
  } = {},
): Promise<string> {
  if (opts.dryRun) {
    return `dry-run:${bidEth}ETH`
  }

  const kernelClient = await makeSessionKernelClient(config, sessionPrivateKey)

  // For the snipe strategy: override the bundler with a Flashbots-aware one.
  // Flashbots ERC-4337 bundler routes UserOps through private block builders.
  // usePrivateMempool=true → swap bundlerTransport to Flashbots endpoint.
  // (The standard ZeroDev bundler URL can be replaced per-call via a separate client.)

  const gasPriorityMultiplier = opts.gasPriorityMultiplier ?? 1

  const txHash = await kernelClient.sendTransaction({
    to: GENOME_CONTRACT,
    data: encodeFunctionData({ abi: GENOME_ABI, functionName: 'bidAndMint' }),
    value: parseEther(bidEth),
    // Boost priority fee for snipe calls
    maxPriorityFeePerGas:
      gasPriorityMultiplier > 1
        ? await (async () => {
            const fee = await kernelClient.estimateMaxPriorityFeePerGas()
            return BigInt(Math.ceil(Number(fee) * gasPriorityMultiplier))
          })()
        : undefined,
  })

  return txHash as string
}

/**
 * Send native ETH from the Kernel account to toAddress.
 * Requires the ETH transfer policy to be included in the session key (done by buildAllPolicies).
 */
export async function sendEthWithdrawal(
  config: Config,
  sessionPrivateKey: Hex,
  toAddress: Address,
  amountEth: string,
  opts: { dryRun?: boolean } = {},
): Promise<string> {
  if (opts.dryRun) return `dry-run:withdraw-eth:${amountEth}ETH->${toAddress}`

  const kernelClient = await makeSessionKernelClient(config, sessionPrivateKey)

  const txHash = await kernelClient.sendTransaction({
    to: toAddress,
    value: parseEther(amountEth),
    data: '0x',
  })

  return txHash as string
}

/**
 * Transfer GENE (ERC20) from the Kernel account to toAddress.
 * Calls Genome's transfer(address, uint256) — value must be > MAX_TOKEN_ID (9_999_999).
 * Pass amountGene as a human-readable string, e.g. "100" = 100 GENE.
 */
export async function sendGeneWithdrawal(
  config: Config,
  sessionPrivateKey: Hex,
  toAddress: Address,
  amountGene: string,
  opts: { dryRun?: boolean } = {},
): Promise<string> {
  if (opts.dryRun) return `dry-run:withdraw-gene:${amountGene}GENE->${toAddress}`

  const kernelClient = await makeSessionKernelClient(config, sessionPrivateKey)

  // parseEther reuses 18-decimal logic: 1 GENE = 1e18 units
  const txHash = await kernelClient.sendTransaction({
    to: GENOME_CONTRACT,
    data: encodeFunctionData({
      abi: GENOME_ABI,
      functionName: 'transfer',
      args: [toAddress, parseEther(amountGene)],
    }),
    value: 0n,
  })

  return txHash as string
}

export { formatEther, parseEther }
