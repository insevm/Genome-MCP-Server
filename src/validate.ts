import { isAddress } from 'viem'

export function validateAddress(value: string, fieldName: string): void {
  if (!isAddress(value)) {
    throw new Error(`${fieldName} must be a valid Ethereum address (0x…), got: "${value}"`)
  }
}

export function validatePositiveDecimal(value: string, fieldName: string): void {
  if (value === 'all') return
  if (!/^\d+(\.\d{0,18})?$/.test(value) || Number(value) <= 0) {
    throw new Error(`${fieldName} must be a positive decimal number (e.g. "0.1"), got: "${value}"`)
  }
}
