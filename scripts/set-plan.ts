// Set an installation's plan by hand (comps, support). Paid plans normally come from the Dodo webhook (src/billing.ts).
// Usage: npm run plan:set -- <installation id | account login> <free|pro|team>
// Re-reads the installation's workflow files, because the allowed interval depends on the plan.
import { loadConfig } from '../src/config.ts';
import { createDb } from '../src/db.ts';
import { githubApp, realGitHub } from '../src/github.ts';
import { resendMailer } from '../src/mailer.ts';
import { syncInstallation } from '../src/sync.ts';

const [who, plan] = process.argv.slice(2);
if (!who || !['free', 'pro', 'team'].includes(plan)) {
  console.error('Usage: npm run plan:set -- <installation id | account login> <free|pro|team>');
  process.exit(1);
}
const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);
const { rows } = await db.query(
  `UPDATE installations SET plan = $2 WHERE id::text = $1 OR lower(account_login) = lower($1) RETURNING id, account_login`,
  [who, plan],
);
if (!rows.length) {
  console.error(`No installation matches "${who}"`);
  process.exit(1);
}
const deps = { db, gh: realGitHub(githubApp(cfg)), mailer: resendMailer(cfg.resendApiKey, cfg.mailFrom), now: () => new Date(), baseUrl: cfg.baseUrl };
for (const r of rows) {
  await syncInstallation(deps, r.id);
  console.log(`${r.account_login} (${r.id}) is now on ${plan}`);
}
await db.end();
