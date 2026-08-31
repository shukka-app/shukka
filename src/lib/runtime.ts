import { isEdgeLight, isFastly, isNetlify, isWorkerd } from 'std-env'

/**
 * Cloud isolate / function (Workers, Vercel Edge, Netlify, Fastly).
 * Long-lived Node (`runtime === "node"`) is false. See docs/adr/login-rate-limit.md.
 */
export function isCloudFunction(): boolean {
  return isWorkerd || isEdgeLight || isNetlify || isFastly
}
