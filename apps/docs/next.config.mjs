import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();
const appDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(appDir, '../..');

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // pnpm workspace: Next infers the git root, then cannot see `next` from apps/docs/app.
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  // Keep Netlify's publish dir away from a local `next dev` lock on `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@scalar/api-reference-react'],
};

export default withMDX(config);
