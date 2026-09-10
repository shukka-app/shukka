/**
 * Hardening headers every HTTP response carries (docs/spec.md §Runtime).
 * Node/Nitro applies them via routeRules in vite.config.ts; the Worker entry
 * applies them in src/worker.ts. No script-src CSP: the panel has inline scripts.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
}

/** Returns a response with the hardening headers set (existing values are overwritten). */
export function withSecurityHeaders(response: Response): Response {
  const hardened = new Response(response.body, response)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) hardened.headers.set(name, value)
  return hardened
}
