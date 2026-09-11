import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Keep Netlify's publish dir away from a local `next dev` lock on `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@scalar/api-reference-react'],
};

export default withMDX(config);
