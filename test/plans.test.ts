import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import { syncInstallation, upsertInstallation, afterChange } from '../src/sync.ts';
import { sendLimitNotices, sendSlotAlerts } from '../src/alerts.ts';
import { fakeDeps } from './fakes.ts';
import { freshDb, seed } from './helpers.ts';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const T0 = new Date('2026-11-10T00:00:30Z');
const wf = (crons: string[]) => `on:\n  workflow_dispatch:\n${crons.map((c) => `  # cronkick: "${c}"`).join('\n')}\njobs: {}\n`;
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

const TWELVE = Array.from({ length: 12 }, (_, h) => `0 ${h} * * *`); // an hour apart

test('Free: 12 schedules -> 10 active, 2 paused, one email', async () => {
  const f = await installWith({ 'acme/app': TWELVE }, 'free');
  expect(await statuses()).toEqual([{ status: 'active', n: 10 }, { status: 'paused_limit', n: 2 }]);
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0].subject).toMatch(/2 schedules paused/);
  await afterChange(f.deps, 1); // re-sync: no second email
  expect(f.sent).toHaveLength(1);
});

test('upgrade to Pro activates everything', async () => {
  const f = await installWith({ 'acme/app': TWELVE }, 'free');
  await db.query(`UPDATE installations SET plan = 'pro'`);
  await afterChange(f.deps, 1);
  expect(await statuses()).toEqual([{ status: 'active', n: 12 }]);
});

test('Free: any number of repos, within the schedule limit', async () => {
  await installWith({ 'acme/app': ['0 * * * *'], 'acme/docs': ['30 * * * *'] }, 'free');
  expect(await statuses()).toEqual([{ status: 'active', n: 2 }]);
});

test('Free: every 10 min is flagged by the interval check, not paused', async () => {
  await installWith({ 'acme/app': ['*/10 * * * *'] }, 'free');
  const { rows } = await db.query('SELECT flags FROM workflows');
  expect(rows[0].flags[0].message).toMatch(/every 10 min/);
  expect(await statuses()).toEqual([{ status: 'active', n: 1 }]); // the schedule row stays; the flag keeps it from firing
  expect((await db.query(`SELECT count(*)::int AS n FROM slots WHERE state = 'pending'`)).rows[0].n).toBe(0);
});

/** A slot Cronkick tried (`attempts` 1) unless told otherwise. */
async function slotIn(state: string, conclusion: string | null = null, attempts = 1, due = new Date(T0.getTime() - Math.random() * 1e6)) {
  await db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, conclusion, updated_at, attempts)
     VALUES (1, 10, 100, $1, $1, $1, $1, $2, $3, $1, $4)`,
    [due, state, conclusion, attempts],
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

test('alerts: never-tried expiries are one summary per account, sent once, retried after a failed send', async () => {
  await seed(db, { plan: 'pro' });
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  for (let i = 0; i < 24; i++) await slotIn('expired', null, 0, new Date(T0.getTime() - (i + 1) * 5 * 60_000));
  const f = fakeDeps(db, T0);
  f.setFailMail(true);
  expect(await sendSlotAlerts(f.deps)).toBe(0);
  f.setFailMail(false);
  expect(await sendSlotAlerts(f.deps)).toBe(1);
  expect(await sendSlotAlerts(f.deps)).toBe(0);
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0].subject).toBe('Cronkick: 24 scheduled runs not sent');
  expect(f.sent[0].text).toMatch(/due from 2026-11-09T22:00:30.000Z to 2026-11-09T23:55:30.000Z \(UTC\)/);
  expect(f.sent[0].text).toMatch(/dashboard\/1$/);
});

test('alerts: a trickle of never-tried expiries sends one summary an hour; the next one includes the rest', async () => {
  await seed(db, { plan: 'pro' });
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  const f = fakeDeps(db, T0);
  for (let i = 0; i < 10; i++) {
    f.clock.now = new Date(T0.getTime() + i * 60_000);
    await slotIn('expired', null, 0, new Date(f.clock.now.getTime() - 6 * 60_000));
    await sendSlotAlerts(f.deps);
  }
  expect(f.sent.map((m) => m.subject)).toEqual(['Cronkick: 1 scheduled run not sent']);
  f.clock.now = new Date(T0.getTime() + 60 * 60_000);
  expect(await sendSlotAlerts(f.deps)).toBe(1);
  expect(f.sent[1].subject).toBe('Cronkick: 9 scheduled runs not sent');
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

test('limit sweep: a suspended installation gets no limit email', async () => {
  const f = await installWith({ 'acme/app': TWELVE }, 'free');
  await db.query(`UPDATE installations SET limit_email_sent_at = NULL, suspended = true`);
  f.sent.length = 0;
  await sendLimitNotices(f.deps);
  expect(f.sent).toHaveLength(0);
});

test('limit sweep: emails once an alert address exists, once, and again after unpausing', async () => {
  const f = await installWith({ 'acme/app': TWELVE }, 'free');
  await db.query(`UPDATE installations SET alert_email = NULL, limit_email_sent_at = NULL`);
  f.sent.length = 0;
  await sendLimitNotices(f.deps);
  expect(f.sent).toHaveLength(0); // paused, but nowhere to send it
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  await sendLimitNotices(f.deps);
  expect(f.sent.map((m) => [m.to, m.subject])).toEqual([['ops@acme.dev', expect.stringMatching(/2 schedules paused/)]]);
  await sendLimitNotices(f.deps);
  expect(f.sent).toHaveLength(1);
  await db.query(`UPDATE installations SET plan = 'pro'`);
  await afterChange(f.deps, 1); // nothing paused: resets
  expect((await db.query('SELECT limit_email_sent_at FROM installations')).rows[0].limit_email_sent_at).toBeNull();
  await sendLimitNotices(f.deps);
  expect(f.sent).toHaveLength(1);
});
