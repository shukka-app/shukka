#!/usr/bin/env node
/**
 * Regenerates public/openapi.json from the Shukka repo's spec builder
 * (src/server/openapi.ts — a pure function, imported standalone via tsx,
 * nothing is written to the shukka repo).
 *
 *   npm run sync:openapi
 *
 * Env:
 *   SHUKKA_REPO    path to a shukka checkout (default: ../shukka)
 *   SHUKKA_ORIGIN  server URL baked into the spec's servers[0].url
 *                  (default: https://updates.example.com)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shukkaRepo = resolve(process.env.SHUKKA_REPO ?? join(root, '..', 'shukka'));
const origin = process.env.SHUKKA_ORIGIN ?? 'https://updates.example.com';

const script = `import { openApiDocument } from './src/server/openapi.ts'; process.stdout.write(JSON.stringify(openApiDocument(${JSON.stringify(origin)}), null, 2) + '\\n')`;

const json = execFileSync('npx', ['--yes', 'tsx', '-e', script], {
  cwd: shukkaRepo,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

const spec = JSON.parse(json);
if (typeof spec.openapi !== 'string' || !spec.paths) {
  throw new Error('Unexpected output: not an OpenAPI document');
}

const out = join(root, 'public', 'openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, json);
console.log(`Wrote ${out} (${Object.keys(spec.paths).length} paths, servers[0].url=${spec.servers?.[0]?.url})`);
