import { isEdgeLight, isFastly, isNetlify, isWorkerd, runtime } from 'std-env'

/**
 * Cloud isolate / function (Workers, Vercel Edge, Netlify, Fastly).
 * Long-lived Node (`runtime === "node"`) is false. See docs/adr/login-rate-limit.md.
 */
export function isCloudFunction(): boolean {
  return isWorkerd || isEdgeLight || isNetlify || isFastly
}

/** Real Node, not Bun/Deno compat (`isNode` is true under those). */
export function isNodeRuntime(): boolean {
  return runtime === 'node'
}

/**
 * libsql entry for this process. Dynamic `import()` only — never statically
 * pull `@libsql/client` into a Worker-destined graph. See docs/adr/libsql-async.md.
 */
export function libsqlClientEntry(): '@libsql/client' | '@libsql/client/web' {
  return isNodeRuntime() ? '@libsql/client' : '@libsql/client/web'
}
