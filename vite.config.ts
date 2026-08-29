import { execSync } from 'node:child_process'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

/**
 * Commit the running build was cut from — the panel pins agent-skill installs
 * to it. Builds without git metadata (e.g. a source tarball) fall back to
 * 'dev', which callers treat as "unpinned".
 */
const gitSha = (() => {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
})()

export default defineConfig({
  define: { __GIT_SHA__: JSON.stringify(gitSha) },
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    nitro({
      routeRules: {
        '/**': {
          headers: {
            'x-frame-options': 'DENY',
            'content-security-policy': "frame-ancestors 'none'",
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'same-origin',
          },
        },
      },
    }),
  ],
})
