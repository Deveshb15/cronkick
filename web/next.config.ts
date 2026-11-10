import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const worker = process.env.WORKER_URL ?? 'http://127.0.0.1:3001';
// deploy/push.sh writes one id per deploy to every server, read at build and at start. Without it, each server's
// build gets its own id, and a browser bouncing between servers behind the load balancer reloads the whole page.
const deploymentId = (() => { try { return readFileSync(path.join(import.meta.dirname, '.deployment-id'), 'utf8').trim(); } catch { return undefined; } })();

const config: NextConfig = {
  // Lets the web app import shared code from ../src (plan limits).
  turbopack: { root: path.join(import.meta.dirname, '..') },
  outputFileTracingRoot: path.join(import.meta.dirname, '..'),
  poweredByHeader: false,
  deploymentId,
  // Cloudflare compresses at the edge; compressing here too can buffer the live-update stream.
  compress: false,
  // Loaded at runtime, not bundled: bundling it breaks Sentry's own module hooks.
  serverExternalPackages: ['@sentry/node'],
  // The worker (src/main.ts) owns webhooks and the health check; the web app fronts everything on one port.
  async rewrites() {
    return [
      { source: '/webhooks', destination: `${worker}/webhooks` },
      { source: '/healthz', destination: `${worker}/healthz` },
      { source: '/healthz/dispatch', destination: `${worker}/healthz/dispatch` },
    ];
  },
};
export default config;
