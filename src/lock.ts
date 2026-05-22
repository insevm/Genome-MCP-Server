import * as net from 'net'
import * as fs from 'fs/promises'

export interface LockPaths {
  socketPath: string
  pidFile: string
}

export const DEFAULT_LOCK_PATHS: LockPaths = {
  socketPath: '/tmp/genome-bid-mcp.sock',
  pidFile: '/tmp/genome-bid-mcp.pid',
}

const WAIT_TIMEOUT_MS = 3000
const POLL_INTERVAL_MS = 100

interface ActiveLock {
  server: net.Server
  paths: LockPaths
}

// Module-level reference to the active lock so releaseLock() can close it safely.
let _activeLock: ActiveLock | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function unlinkIfExists(path: string): Promise<void> {
  try {
    await fs.unlink(path)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

async function readPid(paths: LockPaths): Promise<number | null> {
  try {
    const content = await fs.readFile(paths.pidFile, 'utf8')
    const pid = Number(content.trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Test whether an existing socket has a live listener.
 * Returns true if a connection succeeds (process alive),
 * false if ECONNREFUSED / ENOENT (stale or absent).
 */
async function testConnection(paths: LockPaths): Promise<boolean> {
  return new Promise((resolve) => {
    const client = net.createConnection(paths.socketPath)
    client.once('connect', () => {
      client.destroy()
      resolve(true)
    })
    client.once('error', () => {
      resolve(false)
    })
  })
}

/**
 * Read PID from PID_FILE and send SIGTERM (best-effort, ignores all errors).
 */
async function killOldProcess(paths: LockPaths): Promise<number | null> {
  const pid = await readPid(paths)
  if (pid !== null && pid !== process.pid) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Process may already be dead — ignore
    }
  }
  return pid
}

/**
 * Wait until a specific PID exits.
 */
async function waitForProcessExit(pid: number): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(
    `[genome-bid-mcp] Timed out waiting for process ${pid} to exit before taking over the lock`,
  )
}

/**
 * Fallback for legacy/partial locks with a live socket but no PID file:
 * wait until the socket file disappears, which means cleanup completed.
 */
async function waitForSocketCleanup(paths: LockPaths): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const alive = await testConnection(paths)
    if (!alive && !await pathExists(paths.socketPath)) return
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(
    `[genome-bid-mcp] Timed out waiting for existing process to release lock on ${paths.socketPath}`,
  )
}

/**
 * Remove a stale socket path once we know nobody is listening on it.
 */
async function cleanupStaleSocket(paths: LockPaths): Promise<void> {
  if (!await testConnection(paths)) {
    await unlinkIfExists(paths.socketPath)
  }
}

/**
 * Release leftover files for a path only when no live listener remains.
 */
async function cleanupFiles(paths: LockPaths): Promise<void> {
  if (await testConnection(paths)) return

  await unlinkIfExists(paths.socketPath)

  const pid = await readPid(paths)
  if (pid === null || pid === process.pid || !isProcessAlive(pid)) {
    await unlinkIfExists(paths.pidFile)
  }
}

/**
 * Bind a new net.Server to socketPath atomically (OS-level).
 * Throws EADDRINUSE if another process won the race.
 */
function bindSocket(paths: LockPaths): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(paths.socketPath, () => resolve(server))
    server.on('error', reject)
  })
}

/**
 * Acquire the process lock.
 *
 * 1. If an existing socket is alive, terminate the old process and wait for its cleanup.
 * 2. Remove any stale socket file left behind by a dead process.
 * 3. Bind to socketPath atomically.
 * 4. Write PID file.
 */
export async function acquireLock(paths: LockPaths = DEFAULT_LOCK_PATHS): Promise<void> {
  const alive = await testConnection(paths)

  if (alive) {
    const oldPid = await killOldProcess(paths)
    if (oldPid !== null && oldPid !== process.pid) {
      await waitForProcessExit(oldPid)
    } else if (_activeLock === null || _activeLock.paths.socketPath !== paths.socketPath) {
      await waitForSocketCleanup(paths)
    }
  }

  await cleanupStaleSocket(paths)

  const server = await bindSocket(paths)
  _activeLock = { server, paths }

  try {
    await fs.writeFile(paths.pidFile, String(process.pid), 'utf8')
  } catch (err) {
    await releaseLock(paths)
    throw err
  }
}

/**
 * Release the process lock. Idempotent — safe to call multiple times.
 */
export async function releaseLock(paths: LockPaths = DEFAULT_LOCK_PATHS): Promise<void> {
  const activeLock = _activeLock
  const targetPaths = activeLock?.paths ?? paths

  if (activeLock !== null) {
    _activeLock = null
    await new Promise<void>((resolve) => {
      activeLock.server.close(() => resolve())
    })
  }

  await cleanupFiles(targetPaths)
}
