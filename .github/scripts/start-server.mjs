#!/usr/bin/env node
// Starts the built Shukka server detached so later workflow steps can call it.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { spawnDetached } from './spawn-detached.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const server = join(repoRoot, 'apps/shukka/.output/server/index.mjs')
const endpoint = new URL(process.env.SHUKKA_URL || 'http://localhost:3000')
const logPath = process.env.SHUKKA_LOG || join(process.env.RUNNER_TEMP || repoRoot, 'shukka-server.log')

const child = spawnDetached(process.execPath, [server], {
  logPath,
  env: {
    ...process.env,
    PORT: endpoint.port || '3000',
  },
})
process.stdout.write(`Shukka pid ${child.pid} log ${logPath}\n`)

await new Promise((resolve, reject) => {
  const wait = spawn(process.execPath, [join(here, 'wait-for.mjs'), `${endpoint.origin}/api/admin/session`], {
    stdio: 'inherit',
  })
  wait.on('exit', (code) => {
    if (code === 0) {
      resolve()
      return
    }
    try {
      process.stderr.write(`${readFileSync(logPath, 'utf8')}\n`)
    } catch {
      // The process may have died before creating a log.
    }
    reject(new Error(`Shukka did not become ready (exit ${code})`))
  })
})
