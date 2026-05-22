import * as net from 'net'
import * as fs from 'fs/promises'
import { spawn, type ChildProcess } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { acquireLock, releaseLock, type LockPaths } from '../lock.js'

let testDir = ''
let paths: LockPaths
const childProcesses: ChildProcess[] = []

function holdSocket(socketPath: string): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(socketPath, () => resolve(server))
    server.on('error', reject)
  })
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

async function tryUnlink(path: string): Promise<void> {
  try {
    await fs.unlink(path)
  } catch {
    // ignore ENOENT
  }
}

async function canConnect(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = net.createConnection(socketPath)
    client.once('connect', () => {
      client.destroy()
      resolve(true)
    })
    client.once('error', () => {
      resolve(false)
    })
  })
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 3000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('Timed out waiting for condition')
}

function spawnLockHolder(mode: 'graceful' | 'stubborn'): ChildProcess {
  const script = `
    import net from 'node:net'
    import { writeFile, unlink } from 'node:fs/promises'

    const socketPath = process.env.LOCK_SOCKET_PATH
    const pidFile = process.env.LOCK_PID_FILE
    const mode = process.env.LOCK_MODE

    const cleanup = async () => {
      await unlink(socketPath).catch(() => {})
      await unlink(pidFile).catch(() => {})
      process.exit(0)
    }

    const server = net.createServer()
    server.listen(socketPath, async () => {
      await writeFile(pidFile, String(process.pid), 'utf8')
    })

    process.on('SIGTERM', () => {
      if (mode === 'stubborn') return
      setTimeout(() => {
        server.close(() => {
          cleanup().catch(() => process.exit(1))
        })
      }, 200)
    })

    setInterval(() => {}, 1000)
  `

  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    env: {
      ...process.env,
      LOCK_SOCKET_PATH: paths.socketPath,
      LOCK_PID_FILE: paths.pidFile,
      LOCK_MODE: mode,
    },
    stdio: 'ignore',
  })

  childProcesses.push(child)
  return child
}

async function waitForChildReady(): Promise<void> {
  await waitFor(async () => {
    try {
      const pidContent = await fs.readFile(paths.pidFile, 'utf8')
      return Number(pidContent.trim()) > 0 && await canConnect(paths.socketPath)
    } catch {
      return false
    }
  })
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return

  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
    child.kill('SIGKILL')
  })
}

beforeEach(async () => {
  testDir = await fs.mkdtemp(join(tmpdir(), 'genome-lock-test-'))
  paths = {
    socketPath: join(testDir, 'lock.sock'),
    pidFile: join(testDir, 'lock.pid'),
  }
})

afterEach(async () => {
  await releaseLock(paths)
  await Promise.all(childProcesses.splice(0).map(stopChild))
  await tryUnlink(paths.socketPath)
  await tryUnlink(paths.pidFile)
  await fs.rm(testDir, { recursive: true, force: true })
})

describe('acquireLock', () => {
  it('acquires lock when no socket exists', async () => {
    await acquireLock(paths)

    const pidContent = await fs.readFile(paths.pidFile, 'utf8')
    expect(Number(pidContent.trim())).toBe(process.pid)
  })

  it('cleans up stale socket (ECONNREFUSED) and acquires', async () => {
    const server = await holdSocket(paths.socketPath)
    await closeServer(server)

    await expect(acquireLock(paths)).resolves.toBeUndefined()

    const pidContent = await fs.readFile(paths.pidFile, 'utf8')
    expect(Number(pidContent.trim())).toBe(process.pid)
  })

  it('waits for the old process to exit before acquiring the lock', async () => {
    const child = spawnLockHolder('graceful')
    await waitForChildReady()

    const start = Date.now()
    await expect(acquireLock(paths)).resolves.toBeUndefined()

    expect(Date.now() - start).toBeGreaterThanOrEqual(150)
    expect(child.exitCode).not.toBeNull()

    const pidContent = await fs.readFile(paths.pidFile, 'utf8')
    expect(Number(pidContent.trim())).toBe(process.pid)
  })

  it('throws if the old process does not exit within the timeout', async () => {
    spawnLockHolder('stubborn')
    await waitForChildReady()

    await expect(acquireLock(paths)).rejects.toThrow(/Timed out waiting for process/)
  }, 10000)
})

describe('releaseLock', () => {
  it('removes socket and PID files after acquireLock', async () => {
    await acquireLock(paths)
    await releaseLock(paths)

    await expect(fs.access(paths.socketPath)).rejects.toThrow()
    await expect(fs.access(paths.pidFile)).rejects.toThrow()
  })

  it('is idempotent — releaseLock twice without acquiring does not throw', async () => {
    await expect(releaseLock(paths)).resolves.toBeUndefined()
    await expect(releaseLock(paths)).resolves.toBeUndefined()
  })
})
