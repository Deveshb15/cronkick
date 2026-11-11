// Fill a throwaway database with realistic accounts, so every page and state of the site can be looked at locally.
// Usage: DATABASE_URL=postgres://localhost/cronkick_demo npx tsx scripts/demo-seed.ts
// It wipes the database, so it refuses any database whose name doesn't contain "demo".
import { createDb, migrate } from '../src/db.ts';
import { planSlots } from '../src/slots.ts';

const url = process.env.DATABASE_URL ?? '';
if (!/demo/.test(new URL(url).pathname)) throw new Error(`refusing to wipe ${url}: the database name must contain "demo"`);
const db = createDb(url);
await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await migrate(db);

const now = new Date();
const H = 3_600_000;
const ago = (ms: number) => new Date(now.getTime() - ms);
// Small, steady pseudo-random numbers, so every run of the seed looks the same.
let s = 42;
const rnd = () => ((s = (s * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);

// Cronkick itself was down for 40 minutes this morning: no account has slots inside that window.
const gap = { from: ago(6 * H), to: ago(6 * H - 40 * 60_000) };

type Wf = { id: number; repo: number; path: string; name: string; crons: [string, string?][]; flags?: object[]; paused?: boolean; created?: Date };
async function account(id: number, login: string, plan: 'free' | 'pro', created: Date, repos: [number, string][], wfs: Wf[]) {
  await db.query(`INSERT INTO installations (id, account_login, account_type, plan, alert_email, created_at) VALUES ($1, $2, 'Organization', $3, $4, $5)`,
    [id, login, plan, plan === 'pro' ? `ops@${login}.dev` : null, created]);
  for (const [rid, name] of repos) {
    await db.query(`INSERT INTO repos (id, installation_id, full_name, default_branch, created_at) VALUES ($1, $2, $3, 'main', $4)`, [rid, id, `${login}/${name}`, created]);
  }
  for (const w of wfs) {
    await db.query(`INSERT INTO workflows (id, repo_id, path, name, flags) VALUES ($1, $2, $3, $4, $5)`, [w.id, w.repo, w.path, w.name, JSON.stringify(w.flags ?? [])]);
    for (const [cron, tz] of w.crons) {
      await db.query(`INSERT INTO schedules (workflow_id, cron, tz, status, created_at) VALUES ($1, $2, $3, $4, $5)`,
        [w.id, cron, tz ?? 'UTC', w.paused ? 'paused_limit' : 'active', w.created ?? created]);
    }
  }
}

/** History for one workflow from `from` until now, plus the next two hours as pending. `pick` decides each past slot's fate. */
async function history(inst: number, w: Wf, from: Date, pick: (due: Date, i: number) => Partial<Row> | 'skip') {
  const plans = planSlots(w.id, w.crons.map(([cron, tz]) => ({ cron, tz: tz ?? 'UTC' })), from, new Date(now.getTime() + 2 * H));
  let i = 0;
  for (const p of plans) {
    if (p.dueAt > gap.from && p.dueAt <= gap.to) continue;
    const past = p.dueAt < ago(60_000);
    let row: Partial<Row>;
    if (w.paused) row = { state: 'skipped' };
    else if (!past) row = { state: 'pending' };
    else {
      const r = pick(p.dueAt, i++);
      if (r === 'skip') continue;
      row = r;
    }
    await insertSlot(inst, w, p, row);
  }
}

type Row = { state: string; delayS: number; attempts: number; status: number; note: string; conclusion: string | null; runS: number };
async function insertSlot(inst: number, w: Wf, p: { dueAt: Date; fireAt: Date; deadlineAt: Date }, r: Partial<Row>) {
  const state = r.state ?? 'accepted';
  const sent = ['fired', 'accepted', 'unknown'].includes(state);
  const fired = sent ? new Date(p.fireAt.getTime() + (r.delayS ?? 0.4 + rnd() * 1.2) * 1000) : null;
  const tried = sent || state === 'rejected' || (state === 'expired' && (r.attempts ?? 0) > 0) || state === 'dispatching';
  const runId = state === 'accepted' ? Math.floor(1e10 + rnd() * 1e9) : null;
  const started = runId && fired ? new Date(fired.getTime() + (4 + rnd() * 20) * 1000) : null;
  const done = started && r.conclusion !== null ? new Date(started.getTime() + (r.runS ?? 30 + rnd() * 200) * 1000) : null;
  await db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, state, attempts, next_attempt_at, lease_until,
                        first_attempt_at, fired_at, response_status, response_note, run_id, run_url, matched_by, conclusion, run_started_at, run_completed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$5,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [inst, w.repo, w.id, p.dueAt, p.fireAt, p.deadlineAt, state, r.attempts ?? (tried ? 1 : 0),
      state === 'dispatching' ? new Date(now.getTime() + 45_000) : null,
      tried ? (fired ?? p.fireAt) : null, fired,
      r.status ?? (state === 'accepted' ? 200 : state === 'fired' ? 204 : null), r.note ?? null,
      runId, runId ? `https://github.com/demo/${w.repo}/actions/runs/${runId}` : null, runId ? 'run_id' : null,
      state === 'accepted' ? (r.conclusion === undefined ? 'success' : r.conclusion) : null, started, done, fired ?? p.dueAt],
  );
}

// 1. acme (Pro): a healthy team with a busy week and a few real incidents to read about.
const acme: Wf[] = [
  { id: 1001, repo: 101, path: '.github/workflows/sync-orders.yml', name: 'Sync orders', crons: [['*/15 * * * *']] },
  { id: 1002, repo: 101, path: '.github/workflows/nightly-backup.yml', name: 'Nightly backup', crons: [['0 2 * * *', 'America/New_York']] },
  { id: 1003, repo: 102, path: '.github/workflows/hourly-report.yml', name: 'Hourly report', crons: [['0 * * * *']] },
  { id: 1004, repo: 103, path: '.github/workflows/refresh-cache.yml', name: 'Refresh cache', crons: [['*/5 * * * *']] },
];
await account(1, 'acme', 'pro', ago(40 * 24 * H), [[101, 'shop'], [102, 'analytics'], [103, 'edge']], acme);
// Still on GitHub's own `schedule:`: the overview offers to move it.
await db.query(`INSERT INTO workflows (id, repo_id, path, name, suggested_diff) VALUES (1005, 102, '.github/workflows/weekly-export.yml', 'Weekly export', $1)`,
  ['  # cronkick: "0 4 * * 1"']);
await history(1, acme[0], ago(7 * 24 * H), (_, i) => (i === 300 ? { delayS: 74 } : i % 97 === 13 ? { conclusion: 'failure', runS: 41 } : {}));
await history(1, acme[1], ago(7 * 24 * H), () => ({}));
await history(1, acme[2], ago(7 * 24 * H), (due) => (now.getTime() - due.getTime() < 3 * H && now.getTime() - due.getTime() > 2 * H
  ? { state: 'unknown', note: 'No response from GitHub within 10 s' } : {}));
await history(1, acme[3], ago(3 * 24 * H), (due, i) => {
  const age = now.getTime() - due.getTime();
  if (age < 5 * 60_000) return { state: 'dispatching' };
  if (i === 500) return { state: 'expired', attempts: 4, status: 503, note: 'Service Unavailable' };
  return i % 211 === 7 ? { delayS: 38 } : {};
});

// 2. globex (Free): something needs fixing, one schedule is over the plan limit, one run is overdue right now.
const globex: Wf[] = [
  { id: 2001, repo: 201, path: '.github/workflows/deploy-docs.yml', name: 'Deploy docs', crons: [['0 */6 * * *']] },
  { id: 2002, repo: 201, path: '.github/workflows/lint.yml', name: 'Weekly lint', crons: [], flags: [{ line: 3, message: "This workflow has no `workflow_dispatch:` trigger, so it can't be started by Cronkick. Add `workflow_dispatch:` under `on:`." }] },
  { id: 2003, repo: 202, path: '.github/workflows/sync.yml', name: 'Sync CRM', crons: [['*/30 * * * *']] },
  // Eight small jobs bring globex to the Free limit of 10 live schedules, so the eleventh really is paused.
  ...['Backfill', 'Digest', 'Cleanup', 'Metrics', 'Sitemap', 'Feeds', 'Cache warm', 'Reports'].map((name, i) => (
    { id: 2010 + i, repo: 201, path: `.github/workflows/job-${i + 1}.yml`, name, crons: [[`${i * 5} */2 * * *`]] as [string, string?][] })),
  { id: 2004, repo: 202, path: '.github/workflows/extra.yml', name: 'Extra job', crons: [['0 9 * * 1-5']], paused: true },
];
await account(2, 'globex', 'free', ago(10 * 24 * H), [[201, 'website'], [202, 'crm-sync']], globex);
await history(2, globex[0], ago(7 * 24 * H), (_, i) => (i === 20 ? { state: 'rejected', status: 422, note: "Workflow does not have 'workflow_dispatch' trigger" } : {}));
await history(2, globex[2], ago(7 * 24 * H), () => ({}));
// The latest due run was never sent: with no worker running locally it stays "Overdue".
await db.query(
  `UPDATE slots SET state = 'pending', attempts = 0, first_attempt_at = NULL, fired_at = NULL, response_status = NULL, run_id = NULL, run_url = NULL,
          matched_by = NULL, conclusion = NULL, run_started_at = NULL, run_completed_at = NULL
    WHERE id = (SELECT id FROM slots WHERE workflow_id = 2003 AND due_at < $1 ORDER BY due_at DESC LIMIT 1)`, [ago(60_000)]);
for (const w of globex.filter((x) => x.id >= 2004)) await history(2, w, ago(7 * 24 * H), () => ({}));

// 3. initech (Free): just installed; one nightly schedule, nothing has run yet.
const initech: Wf[] = [{ id: 3001, repo: 301, path: '.github/workflows/nightly.yml', name: 'Nightly build', crons: [['30 3 * * *', 'Europe/Berlin']] }];
await account(3, 'initech', 'free', ago(20 * 60_000), [[301, 'api']], initech);
await db.query(`INSERT INTO workflows (id, repo_id, path, name, suggested_diff) VALUES (3002, 301, '.github/workflows/docs.yml', 'Publish docs', $1)`,
  ['  # cronkick: "0 6 * * *"']);
for (const p of planSlots(3001, [{ cron: '30 3 * * *', tz: 'Europe/Berlin' }], now, new Date(now.getTime() + 2 * H))) await insertSlot(3, initech[0], p, { state: 'pending' });

// 4. umbrella (Pro): a quiet account whose only news is the outage.
const umbrella: Wf[] = [
  { id: 4001, repo: 401, path: '.github/workflows/poll.yml', name: 'Poll vendors', crons: [['*/10 * * * *']] },
  { id: 4002, repo: 401, path: '.github/workflows/report.yml', name: 'Morning report', crons: [['0 6 * * *', 'Europe/London']] },
];
await account(4, 'umbrella', 'pro', ago(30 * 24 * H), [[401, 'ops']], umbrella);
await history(4, umbrella[0], ago(2 * 24 * H), () => ({}));
await history(4, umbrella[1], ago(20 * 24 * H), () => ({}));
await db.query('INSERT INTO coverage_gaps (started_at, ended_at, detected_at) VALUES ($1, $2, $2)', [gap.from, gap.to]);

// 5. solo (Free): one schedule, a month of quiet, healthy history. The case a new paying user sees most.
const solo: Wf[] = [{ id: 5001, repo: 501, path: '.github/workflows/sync.yml', name: 'Sync orders', crons: [['*/15 * * * *']] }];
await account(5, 'solo', 'free', ago(26 * 24 * H), [[501, 'side-project']], solo);
await history(5, solo[0], ago(26 * 24 * H), (_, i) => (i === 1300 ? { delayS: 36 } : i % 400 === 77 ? { conclusion: 'failure', runS: 18 } : {}));

// 6. you (Free): a day old, one schedule, and the two workflows it still runs on GitHub's own `schedule:`.
const you: Wf[] = [{ id: 6001, repo: 601, path: '.github/workflows/cronkick.yml', name: 'cronkick', crons: [['*/15 * * * *']] }];
await account(6, 'you', 'free', ago(20 * H), [[601, 'cronkick-probe-a']], you);
await db.query(`INSERT INTO workflows (id, repo_id, path, name, suggested_diff) VALUES
  (6002, 601, '.github/workflows/every-5.yml', 'every-5', $1), (6003, 601, '.github/workflows/hourly.yml', 'hourly', $2)`,
  ['  # cronkick: "*/5 * * * *"', '  # cronkick: "0 * * * *"']);
await history(6, you[0], ago(19 * H), () => ({}));

// The planner is healthy, so /healthz/dispatch reads ok.
await db.query('UPDATE planner SET planned_until = $1', [new Date(now.getTime() + 2 * H)]);

// /lateness: two probe repos, a week of GitHub's own scheduled runs (late by a few minutes, some dropped).
// DEMO_PROBES=thin instead: one private repo, 16 h old, where GitHub ran almost nothing (what production saw first).
const probes = ['cronkick-probes/hourly-a', 'cronkick-probes/hourly-b'];
let run = 1;
if (process.env.DEMO_PROBES === 'thin') {
  const ran: [string, string, number, number][] = [ // workflow, cron, hours ago due, seconds late
    ['.github/workflows/every-5.yml', '*/5 * * * *', 15.5, 17], ['.github/workflows/every-5.yml', '*/5 * * * *', 11, 102],
    ['.github/workflows/every-5.yml', '*/5 * * * *', 6.25, 240], ['.github/workflows/every-5.yml', '*/5 * * * *', 2, 95],
    ['.github/workflows/hourly.yml', '0 * * * *', 15, 1440], ['.github/workflows/hourly.yml', '0 * * * *', 9, 3030], ['.github/workflows/hourly.yml', '0 * * * *', 4, 2580],
  ];
  for (const [file, cron, h, s] of ran) {
    const step = cron.startsWith('*/5') ? 5 * 60_000 : H;
    const due = new Date(Math.floor(ago(h * H).getTime() / step) * step);
    await db.query('INSERT INTO probe_runs (run_id, repo, workflow, cron, due_at, started_at) VALUES ($1, $2, $3, $4, $5, $6)', [run++, probes[0], file, cron, due, new Date(due.getTime() + s * 1000)]);
  }
  await db.query('INSERT INTO probe_health (repo, private, last_attempt_at, last_success_at) VALUES ($1, true, $2, $2)', [probes[0], ago(3 * 60_000)]);
} else for (const repo of probes) {
  for (const wf of [{ file: '.github/workflows/every-5.yml', cron: '*/5 * * * *', step: 5 }, { file: '.github/workflows/hourly.yml', cron: '0 * * * *', step: 60 }]) {
    for (let t = Math.ceil(ago(7 * 24 * H).getTime() / (wf.step * 60_000)) * wf.step * 60_000; t < ago(2 * H).getTime(); t += wf.step * 60_000) {
      if (rnd() < (wf.step === 5 ? 0.07 : 0.03)) continue; // GitHub dropped it
      const late = (wf.step === 60 && new Date(t).getUTCMinutes() === 0 ? 4 : 1) * 60 * (0.5 + rnd() ** 3 * 18);
      await db.query('INSERT INTO probe_runs (run_id, repo, workflow, cron, due_at, started_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [run++, repo, wf.file, wf.cron, new Date(t), new Date(t + late * 1000)]);
    }
  }
  await db.query('INSERT INTO probe_health (repo, private, last_attempt_at, last_success_at) VALUES ($1, false, $2, $2)', [repo, ago(3 * 60_000)]);
}

console.log(`Seeded ${(await db.query('SELECT count(*) FROM slots')).rows[0].count} slots across 6 accounts, ${run - 1} probe runs.`);
console.log('Accounts: 1 acme (Pro, healthy with incidents), 2 globex (Free, needs a fix), 3 initech (new), 4 umbrella (Pro, two schedules, outage window), 5 solo (Free, one schedule), 6 you (Free, one schedule, two still on GitHub).');
console.log(`Probe repos for /lateness: PROBE_REPOS=${probes.join(',')}`);
await db.end();
