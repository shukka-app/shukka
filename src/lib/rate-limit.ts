const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 10
const GLOBAL_MAX_FAILURES = 100
const MAX_ENTRIES = 10_000
const GLOBAL_KEY = '*'

type Window = { count: number; resetAt: number }

const failures = new Map<string, Window>()

function trustProxy(): boolean {
  const flag = process.env.SHUKKA_TRUST_PROXY
  return flag === '1' || flag === 'true'
}

export function clientIp(request: Request): string {
  // Request has no socket address; unproxied clients share one bucket.
  if (!trustProxy()) return 'direct'
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((part) => part.trim()).filter(Boolean)
    const last = hops[hops.length - 1]
    if (last) return last
  }
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return 'local'
}

function prune(ip: string, now: number): Window | undefined {
  const entry = failures.get(ip)
  if (entry && entry.resetAt <= now) {
    failures.delete(ip)
    return undefined
  }
  return entry
}

function evictOldest(): void {
  for (const key of failures.keys()) {
    if (key === GLOBAL_KEY) continue
    failures.delete(key)
    return
  }
}

export function isLimited(ip: string): boolean {
  const now = Date.now()
  const global = prune(GLOBAL_KEY, now)
  if (global && global.count >= GLOBAL_MAX_FAILURES) return true
  const entry = prune(ip, now)
  return Boolean(entry && entry.count >= MAX_FAILURES)
}

function bump(ip: string, now: number): void {
  const entry = prune(ip, now)
  if (!entry) {
    if (failures.size >= MAX_ENTRIES) evictOldest()
    failures.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  entry.count += 1
}

export function recordFailure(ip: string): void {
  const now = Date.now()
  bump(ip, now)
  if (ip !== GLOBAL_KEY) bump(GLOBAL_KEY, now)
}

export function recordSuccess(ip: string): void {
  if (ip === GLOBAL_KEY) return
  failures.delete(ip)
}

export function resetRateLimitForTests(): void {
  failures.clear()
}
