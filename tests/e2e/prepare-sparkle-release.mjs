/**
 * Writes a Sparkle archive + matching .sig into a directory the Action can
 * publish. Signs with Node Ed25519 (same algorithm as Sparkle sign_update).
 *
 * Env: SHUKKA_DIRECTORY (default ./out), SHUKKA_VERSION (optional).
 * Writes GITHUB_OUTPUT: version, public-key, directory.
 */
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

const directory = resolve(process.env.SHUKKA_DIRECTORY || 'out')
const version = process.env.SHUKKA_VERSION || `2.0.${Date.now() % 100000}`
const zipName = `App-${version}.zip`
const body = Buffer.from(`sparkle-macos-e2e ${version}\n`)

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const signature = sign(null, body, privateKey).toString('base64')
const pubDer = publicKey.export({ type: 'spki', format: 'der' })
const sparklePublicKey = pubDer.subarray(pubDer.length - 32).toString('base64')

mkdirSync(directory, { recursive: true })
writeFileSync(resolve(directory, zipName), body)
writeFileSync(resolve(directory, `${zipName}.sig`), signature)

process.stdout.write(`Prepared Sparkle ${version} in ${directory} (${zipName})\n`)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\npublic-key=${sparklePublicKey}\ndirectory=${directory}\n`,
  )
} else {
  process.stdout.write(`public-key=${sparklePublicKey}\n`)
}
