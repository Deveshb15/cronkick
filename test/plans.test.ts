import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.js';
import { syncInstallation, upsertInstallation, afterChange } from '../src/sync.js';
import { sendSlotAlerts } from '../src/alerts.js';
import { fakeDeps } from './fakes.js';
import { freshDb, seed } from './helpers.js';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const T0 = new Date('2026-11-10T00:00:30Z');
const wf = (crons: string[]) => `on:\n  workflow_dispatch:\n${crons.map((c) => `  # ontime: "${c}"`).join('\n')}\njobs: {}\n`;
const FIVE = ['0 */2 * * *', '15 */2 * * *', '30 */2 * * *', '45 */2 * * *', '0 1-23/2 * * *']; // 15 min apart
const statuses = async () => (await db.query(`SELECT status, count(*)::int AS n FROM schedules GROUP BY status ORDER BY status`)).rows;

async function installWith(repos: Record<string, string[]>, plan: 'free' | 'pro') {
  const f = fakeDeps(db, T0);
  await upsertInstallation(f.deps, { id: 1, account: { login: 'acme', type: 'Organization' } });
  await db.query(`UPDATE installations SET plan = $1, alert_email = 'ops@acme.dev'`, [plan]);
  let id = 10;
  for (const [name, crons] of Object.entries(repos)) {
    f.gh.repos.push({ id: id++, fullName: name, defaultBranch: 'main' });
    f.gh.workflows.set(name, [{ id: id * 10, path: '.github/workflows/a.yml', name: 'a' }]);
    f.gh.files.set(`${name}:.github/workflows/a.yml`, wf(crons));
  }
  await syncInstallation(f.deps, 1);
  return f;
}

test('Free: 5 schedules -> 3 active, 2 paused, one email', async () => {
  const f = await installWith({ 'acme/app': FIVE }, 'free');
  expect(await statuses()).toEqual([{ status: 'active', n: 3 }, { status: 'paused_limit', n: 2 }]);
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0].subject).toMatch(/2 schedules paused/);
  await afterChange(f.deps, 1); // re-sync: no second email
  expect(f.sent).toHaveLength(1);
});

test('upgrade to Pro activates everything', async () => {
  const f = await installWith({ 'acme/app': FIVE }, 'free');
  await db.query(`UPDATE installations SET plan = 'pro'`);
  await afterChange(f.deps, 1);
  expect(await statuses()).toEqual([{ status: 'active', n: 5 }]);
});

test('Free: a second repo is paused', async () => {
  await installWith({ 'acme/app': ['0 * * * *'], 'acme/docs': ['30 * * * *'] }, 'free');
  expect(await statuses()).toEqual([{ status: 'active', n: 1 }, { status: 'paused_limit', n: 1 }]);
});

test('Free: every 10 min is flagged by the interval check, not paused', async () => {
  await installWith({ 'acme/app': ['*/10 * * * *'] }, 'free');
  const { rows } = await db.query('SELECT flags FROM workflows');
  expect(rows[0].flags[0].message).toMatch(/every 10 min/);
  expect(await statuses()).toEqual([{ status: 'active', n: 1 }]); // the schedule row stays; the flag keeps it from firing
  expect((await db.query(`SELECT count(*)::int AS n FROM slots WHERE state = 'pending'`)).rows[0].n).toBe(0);
});

async function slotIn(state: string, conclusion: string | null = null) {
  await db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, conclusion, updated_at)
     VALUES (1, 10, 100, $1, $1, $1, $1, $2, $3, $1)`,
    [new Date(T0.getTime() - Math.random() * 1e6), state, conclusion],
  );
}

test('alerts: Pro expired slot emails once', async () => {
  await seed(db, { plan: 'pro' });
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  await slotIn('expired');
  const f = fakeDeps(db, T0);
  expect(await sendSlotAlerts(f.deps)).toBe(1);
  expect(await sendSlotAlerts(f.deps)).toBe(0);
  expect(f.sent[0].subject).toMatch(/expired/);
});

test('alerts: Free gets no slot alerts', async () => {
  await seed(db, { plan: 'free' });
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  await slotIn('expired');
  expect(await sendSlotAlerts(fakeDeps(db, T0).deps)).toBe(0);
});

test('alerts: failed run on Pro emails once; unknown too', async () => {
  await seed(db, { plan: 'pro' });
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  await slotIn('accepted', 'failure');
  await slotIn('unknown');
  const f = fakeDeps(db, T0);
  expect(await sendSlotAlerts(f.deps)).toBe(2);
  expect(f.sent.map((m) => m.subject).sort()).toEqual([expect.stringMatching(/run failed/), expect.stringMatching(/unknown/)].sort());
});

test('alerts: a failed send is retried next pass', async () => {
  await seed(db, { plan: 'pro' });
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  await slotIn('expired');
  const f = fakeDeps(db, T0);
  f.setFailMail(true);
  expect(await sendSlotAlerts(f.deps)).toBe(0);
  f.setFailMail(false);
  expect(await sendSlotAlerts(f.deps)).toBe(1);
});

test('alerts: two servers at once send each alert exactly once', async () => {
  await seed(db, { plan: 'pro' });
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  for (let i = 0; i < 5; i++) await slotIn('expired');
  const a = fakeDeps(db, T0);
  const b = fakeDeps(db, T0);
  const slow = (f: typeof a) => { const send = f.deps.mailer.send; f.deps.mailer.send = async (m) => { await new Promise((r) => setTimeout(r, 5)); return send(m); }; };
  slow(a); slow(b);
  await Promise.all([sendSlotAlerts(a.deps), sendSlotAlerts(b.deps)]);
  expect(a.sent.length + b.sent.length).toBe(5);
});
