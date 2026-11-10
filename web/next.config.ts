import type { NextConfig } from 'next';
import path from 'node:path';

const worker = process.env.WORKER_URL ?? 'http://127.0.0.1:3001';

const config: NextConfig = {
  // Lets the web app import shared code from ../src (plan limits).
  turbopack: { root: path.join(import.meta.dirname, '..') },
  outputFileTracingRoot: path.join(import.meta.dirname, '..'),
  poweredByHeader: false,
  // The worker (src/main.ts) owns webhooks and the health check; the web app fronts everything on one port.
  async rewrites() {
    return [
      { source: '/webhooks', destination: `${worker}/webhooks` },
      { source: '/healthz', destination: `${worker}/healthz` },
    ];
  },
};
export default config;
