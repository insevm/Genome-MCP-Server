import { parseAbi } from 'viem'

export const GENOME_CONTRACT = '0x852740fad3e6f5cd4b234311172db29004cceea7' as const
export const CHAIN_ID = 1
export const BLOCK_PER_MINT = 104n

// Flashbots Protect RPC — no API key needed, hides txs from public mempool
export const FLASHBOTS_RPC = 'https://rpc.flashbots.net'

// ERC-4337 EntryPoint v0.7
export const ENTRYPOINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const

export const GENOME_ABI = parseAbi([
  // Auction
  'function bidAndMint() payable',
  'function winner() view returns (address)',
  'function topBid() view returns (uint256)',
  'function lastMintBlock() view returns (uint64)',
  'function latestTokenId() view returns (uint256)',
  'function BLOCK_PER_MINT() pure returns (uint256)',
  'function MIN_BID() pure returns (uint256)',
  // ERC20 (GENE token) — value must be > MAX_TOKEN_ID (9_999_999) to disambiguate from NFT tokenId
  'function transfer(address to, uint256 value) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function balancesOfFT(address account) view returns (uint256)',
  'function decimals() pure returns (uint8)',
  // Events
  'event BidPlaced(address indexed bidder, uint256 amount)',
  'event AuctionSettled(uint256 indexed tokenId, address indexed winner, uint256 bidAmount)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

export const SETUP_PORT = 47382
