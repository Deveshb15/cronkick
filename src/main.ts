import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { createDb, migrate } from './db.js';
import type { Deps } from './deps.js';
import { githubApp, realGitHub } from './github.js';
import { resendMailer } from './mailer.js';
import { dispatchTick, drain } from './dispatcher.js';
import { materialize, settle } from './maintenance.js';
import { sendSlotAlerts } from './alerts.js';
import { reconcileAll } from './sync.js';
import { collectProbes } from './probe/collector.js';
import { githubOAuth } from './web/auth.js';
import { webApp } from './web/app.js';

const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);
await migrate(db);

const gh = githubApp(cfg);
const deps: Deps = { db, gh: realGitHub(gh), mailer: resendMailer(cfg.resendApiKey, cfg.mailFrom), now: () => new Date(), baseUrl: cfg.baseUrl };
const app = webApp(deps, { webhookSecret: cfg.webhookSecret, sessionSecret: cfg.sessionSecret, appSlug: cfg.appSlug, contactEmail: cfg.contactEmail, oauth: githubOAuth(gh, `${cfg.baseUrl}/callback`) });
const server = serve({ fetch: app.fetch, port: cfg.port }, (i) => console.log(`cronkick listening on :${i.port}`));

let stopping = false;
/** Run fn every `ms`, never overlapping itself. Resolves when stopped and the last run has finished. */
function loop(name: string, ms: number, fn: () => Promise<unknown>): Promise<void> {
  return new Promise((resolve) => {
    const tick = async () => {
      try { await fn(); } catch (e) { console.error(`${name} failed`, e); }
      if (stopping) resolve(); else setTimeout(tick, ms);
    };
    void tick();
  });
}

let lastReconcile = 0;
let lastProbe = 0;
const loops = [
  loop('dispatch', 1000, () => dispatchTick(deps)),
  loop('maintenance', 60_000, async () => {
    const now = new Date();
    await materialize(db, now);
    await settle(db, now);
    await sendSlotAlerts(deps);
    if (cfg.probeRepos.length && now.getTime() - lastProbe > 5 * 60_000) {
      lastProbe = now.getTime();
      await collectProbes(db, cfg.probeRepos, cfg.probeToken);
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
    server.close();
    await Promise.race([Promise.all(loops).then(() => drain(deps)), new Promise((r) => setTimeout(r, 15_000))]);
    await db.end();
    process.exit(0);
  });
}
