import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';
import { createDb, migrate } from './db.ts';
import { directDbUrl, loadConfig } from './config.ts';
import type { Deps } from './deps.ts';
import { githubApp, realGitHub } from './github.ts';
import { resendMailer } from './mailer.ts';
import { dispatchTick, drain } from './dispatcher.ts';
import { planAhead, settle } from './maintenance.ts';
import { sendGapAlerts, sendLimitNotices, sendSlotAlerts } from './alerts.ts';
import { reconcileAll } from './sync.ts';
import { collectProbes } from './probe/collector.ts';
import { watchSchedules } from './schedule-watch.ts';
import { webApp } from './web/app.ts';
import { downgradeLapsed, dodoProducts } from './billing.ts';
import { emitPostHogWorkerLog, shutdownPostHogWorkerLogs } from './posthog.ts';

// Errors only (no tracing). Without SENTRY_DSN this is off and capture calls do nothing.
if (process.env.SENTRY_DSN) Sentry.init({ dsn: process.env.SENTRY_DSN, environment: 'production', tracesSampleRate: 0 });

const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);
{
  const direct = createDb(directDbUrl());
  await migrate(direct);
  await direct.end();
}

const gh = githubApp(cfg);
const deps: Deps = { db, gh: realGitHub(gh), mailer: resendMailer(cfg.resendApiKey, cfg.mailFrom), now: () => new Date(), baseUrl: cfg.baseUrl };
const app = webApp(deps, { webhookSecret: cfg.webhookSecret, billing: { secret: cfg.dodoWebhookSecret, products: dodoProducts() } });
const server = serve({ fetch: app.fetch, port: cfg.port }, (i) => console.log(`cronkick listening on :${i.port}`));
emitPostHogWorkerLog('worker started', { port: cfg.port });

let stopping = false;
/** Run fn every `ms`, never overlapping itself. Resolves when stopped and the last run has finished. */
function loop(name: string, ms: number, fn: () => Promise<unknown>): Promise<void> {
  return new Promise((resolve) => {
    const tick = async () => {
      try { await fn(); } catch (e) { console.error(`${name} failed`, e); Sentry.captureException(e, { tags: { loop: name } }); }
      if (stopping) resolve(); else setTimeout(tick, ms);
    };
    void tick();
  });
}

let lastReconcile = 0;
let lastProbe = 0;
let lastWatch = 0;
const loops = [
  loop('dispatch', 1000, () => dispatchTick(deps)),
  loop('maintenance', 60_000, async () => {
    const now = new Date();
    await planAhead(db, now);
    await settle(db, now);
    await sendSlotAlerts(deps);
    await sendGapAlerts(deps);
    await sendLimitNotices(deps);
  }),
  // Probes and the daily reconcile call GitHub and can be slow; on their own loop they never hold up planning.
  loop('background', 60_000, async () => {
    const now = new Date();
    // A cancelled subscription's paid period ended: back to Free (re-reads workflow files, so it lives here).
    await downgradeLapsed(deps, now);
    if (cfg.probeRepos.length && now.getTime() - lastProbe > 5 * 60_000) {
      lastProbe = now.getTime();
      await collectProbes(db, cfg.probeRepos, cfg.probeToken);
    }
    // Workflows still on GitHub's schedule: an hourly read confirms what the webhooks said (a few requests each).
    if (now.getTime() - lastWatch > 60 * 60_000) {
      lastWatch = now.getTime();
      await watchSchedules(deps, now);
    }
    if (now.getTime() - lastReconcile > 24 * 60 * 60_000) {
      lastReconcile = now.getTime();
      // On failure, try again in an hour rather than every minute.
      await reconcileAll(deps).catch((e) => { lastReconcile = now.getTime() - 23 * 60 * 60_000; throw e; });
    }
  }),
];

// Let in-flight dispatches finish so they aren't left as `unknown`.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`${sig}: stopping`);
    emitPostHogWorkerLog('worker stopping', { signal: sig });
    server.close();
    await Promise.race([Promise.all(loops).then(() => drain(deps)), new Promise((r) => setTimeout(r, 15_000))]);
    await db.end();
    await shutdownPostHogWorkerLogs();
    process.exit(0);
  });
}
