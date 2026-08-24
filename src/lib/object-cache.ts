const cache = new Map<string, string>()
const MAX_ENTRIES = 500

function remember(key: string, value: string): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}

export function cachedText(key: string, load: () => Promise<string>): Promise<string> {
  const hit = cache.get(key)
  if (hit !== undefined) return Promise.resolve(hit)
  return load().then((value) => {
    remember(key, value)
    return value
  })
}

export function clearObjectCache(): void {
  cache.clear()
}
