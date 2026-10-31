#!/usr/bin/env node
/**
 * Regenerates the OpenAPI snapshots under public/ from the Shukka repo's spec
 * builders (src/server/openapi.ts + src/server/openapi-30.ts — pure functions,
 * imported standalone via the workspace tsx, nothing is written to the shukka repo).
 *
 *   pnpm --filter shukka-docs sync:openapi
 *
 * Snapshots:
 *   openapi.json          3.1.0 / en  — Scalar reference, and the SDK source
 *   openapi.zh-CN.json    3.1.0 / zh  — Scalar reference
 *   openapi.v3.0.json     3.0.3 / en  — generators that reject 3.1 (progenitor)
 *                                       or only beta-support it (openapi-generator)
 *
 * Env:
 *   SHUKKA_REPO    path to a shukka checkout (default: ../shukka)
 *   SHUKKA_ORIGIN  server URL baked into the spec's servers[0].url
 *                  (default: https://updates.example.com)
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shukkaRepo = resolve(process.env.SHUKKA_REPO ?? join(root, '..', 'shukka'));
const origin = process.env.SHUKKA_ORIGIN ?? 'https://updates.example.com';

const snapshots = [
  { locale: 'en', file: 'openapi.json', version: '3.1' },
  { locale: 'zh', file: 'openapi.zh-CN.json', version: '3.1' },
  { locale: 'en', file: 'openapi.v3.0.json', version: '3.0' },
];

function extract(locale, version) {
  const args = `${JSON.stringify(origin)}, ${JSON.stringify(locale)}`;
  const call =
    version === '3.0'
      ? `toOpenApi30(openApiDocument(${args}))`
      : `openApiDocument(${args})`;
  const spec30 = version === '3.0' ? `import { toOpenApi30 } from './src/server/openapi-30.ts'; ` : '';
  const script = `import { openApiDocument } from './src/server/openapi.ts'; ${spec30}process.stdout.write(JSON.stringify(${call}, null, 2) + '\\n')`;

  const json = execFileSync(process.execPath, [require.resolve('tsx/cli'), '-e', script], {
    cwd: shukkaRepo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  const spec = JSON.parse(json);
  if (typeof spec.openapi !== 'string' || !spec.paths) {
    throw new Error(`Unexpected output for locale=${locale} version=${version}: not an OpenAPI document`);
  }
  const expected = version === '3.0' ? '3.0.3' : '3.1.0';
  if (spec.openapi !== expected) {
    throw new Error(`Expected OpenAPI ${expected} for ${version}, got ${spec.openapi}`);
  }
  return { json, spec };
}

mkdirSync(join(root, 'public'), { recursive: true });

for (const { locale, file, version } of snapshots) {
  const { json, spec } = extract(locale, version);
  const out = join(root, 'public', file);
  writeFileSync(out, json);
  console.log(
    `Wrote ${out} (${Object.keys(spec.paths).length} paths, OpenAPI ${spec.openapi}, locale=${locale}, servers[0].url=${spec.servers?.[0]?.url})`,
  );
}
