/**
 * Copy Worker string bindings onto process.env before the app module graph
 * loads. Cloudflare injects vars as bindings; module-scope process.env is
 * otherwise empty. See docs/adr/dual-runtime.md.
 */
export function applyWorkerEnv(env: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') process.env[key] = value
  }
}
