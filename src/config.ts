import { parseAbi } from 'viem'

export const GENOME_CONTRACT = '0x852740fad3e6f5cd4b234311172db29004cceea7' as const
export const CHAIN_ID = 1
export const BLOCK_PER_MINT = 104n

export const FLASHBOTS_RPC = 'https://rpc.flashbots.net'

// Uniswap V3 GENE/WETH pool — used for floor price calculations
export const GENE_WETH_POOL = '0xe7D546042D3aa0EBd6Db63b599305C59F0Eb781c' as const

// Uniswap V3
export const UNISWAP_SWAP_ROUTER = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' as const
export const UNISWAP_QUOTER_V2  = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e' as const
export const WETH9              = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const
export const GENE_ETH_FEE       = 3000 // 0.3 %

export const GENOME_ABI = parseAbi([
  // Auction
  'function bidAndMint() payable',
  'function winner() view returns (address)',
  'function topBid() view returns (uint256)',
  'function minBidToOutbid() view returns (uint256)',
  'function lastMintBlock() view returns (uint64)',
  'function latestTokenId() view returns (uint256)',
  'function BLOCK_PER_MINT() pure returns (uint256)',
  'function MIN_BID() pure returns (uint256)',
  // ERC-20 (GENE token) — value must be > MAX_TOKEN_ID (9_999_999) to disambiguate from NFT id
  'function transfer(address to, uint256 value) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function balancesOfFT(address account) view returns (uint256)',
  'function decimals() pure returns (uint8)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  // Events
  'event BidPlaced(address indexed bidder, uint256 amount)',
  'event AuctionSettled(uint256 indexed tokenId, address indexed winner, uint256 bidAmount)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

export const SWAP_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) payable',
  'function refundETH() payable',
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
])

export const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])
