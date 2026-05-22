import { beforeEach, describe, expect, it, vi } from 'vitest'

const createPublicClientMock = vi.fn(
  ({ transport }: { transport: { type: string } }) => ({ transport }),
)
const httpMock = vi.fn((url: string) => ({ type: 'http', url }))
const webSocketMock = vi.fn((url: string, options?: object) => ({ type: 'webSocket', url, options }))

vi.mock('viem', () => ({
  createPublicClient: createPublicClientMock,
  createWalletClient: vi.fn(),
  http: httpMock,
  webSocket: webSocketMock,
  encodeFunctionData: vi.fn(),
  parseEther: vi.fn(),
  parseGwei: vi.fn(),
  formatEther: vi.fn(),
}))

vi.mock('viem/chains', () => ({
  mainnet: { id: 1 },
}))

vi.mock('viem/accounts', () => ({
  generatePrivateKey: vi.fn(),
  privateKeyToAccount: vi.fn(() => ({ address: '0x0000000000000000000000000000000000000000' })),
}))

import { makePublicClient } from '../wallet.js'

describe('makePublicClient', () => {
  const config = {
    rpcHttpUrl: 'https://example-http-rpc.test',
    rpcWsUrl: 'wss://example-ws-rpc.test',
  } as Parameters<typeof makePublicClient>[0]

  beforeEach(() => {
    createPublicClientMock.mockClear()
    httpMock.mockClear()
    webSocketMock.mockClear()
  })

  it('uses HTTP when preferHttp is enabled', () => {
    const client = makePublicClient(config, { preferHttp: true })

    expect(httpMock).toHaveBeenCalledWith(config.rpcHttpUrl)
    expect(webSocketMock).not.toHaveBeenCalled()
    expect(client.transport.type).toBe('http')
  })

  it('disables viem reconnect when requested for WebSocket clients', () => {
    const client = makePublicClient(config, { webSocketReconnect: false })

    expect(webSocketMock).toHaveBeenCalledWith(config.rpcWsUrl, { reconnect: false })
    expect(httpMock).not.toHaveBeenCalled()
    expect(client.transport.type).toBe('webSocket')
  })
})
