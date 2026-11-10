import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.js';
import { handleEvent, verifySignature } from '../src/webhooks.js';
import { dispatchTick as queue, drain } from '../src/dispatcher.js';
import { linkRun } from '../src/runs.js';
import { fakeDeps } from './fakes.js';
import { freshDb } from './helpers.js';
import { createHmac } from 'node:crypto';

let db: Db;
const dispatchTick = async (d: Parameters<typeof queue>[0]) => { const n = await queue(d); await drain(d); return n; };
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const T0 = new Date('2026-11-10T00:00:30Z');
const wf = (marker: string) => `on:\n  workflow_dispatch: ${marker}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`;
const install = { id: 1, account: { login: 'acme', type: 'Organization' } };

function setup(opts: { plan?: 'free' | 'pro' } = {}) {
  const f = fakeDeps(db, T0);
  f.gh.installations = [install];
  f.gh.repos = [{ id: 10, fullName: 'acme/app', defaultBranch: 'main' }, { id: 11, fullName: 'acme/docs', defaultBranch: 'main' }];
  f.gh.workflows.set('acme/app', [{ id: 100, path: '.github/workflows/nightly.yml', name: 'nightly' }, { id: 101, path: '.github/workflows/ci.yml', name: 'ci' }]);
  f.gh.files.set('acme/app:.github/workflows/nightly.yml', wf('# ontime: "*/15 * * * *"'));
  f.gh.files.set('acme/app:.github/workflows/ci.yml', 'on: push\njobs: {}\n');
  return { ...f, install: async () => {
    await handleEvent(f.deps, 'installation', { action: 'created', installation: install });
    if (opts.plan) await db.query('UPDATE installations SET plan = $1', [opts.plan]);
  } };
}
const count = async (sql: string) => (await db.query(sql)).rows[0].n as number;
const push = (files: string[], branch = 'main') => ({
  ref: `refs/heads/${branch}`, installation: { id: 1 },
  repository: { id: 10, full_name: 'acme/app', default_branch: 'main' },
  commits: [{ added: [], modified: files, removed: [] }],
});

test('signature: valid passes, bad or missing fails', () => {
  const body = '{"a":1}';
  const sig = `sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`;
  expect(verifySignature('s3cret', body, sig)).toBe(true);
  expect(verifySignature('s3cret', body + ' ', sig)).toBe(false);
  expect(verifySignature('s3cret', body, undefined)).toBe(false);
  expect(verifySignature('s3cret', body, 'sha256=abc')).toBe(false);
});

test('install with two repos, one marked workflow: one active schedule and pending slots', async () => {
  const s = setup();
  await s.install();
  expect(await count(`SELECT count(*)::int AS n FROM schedules WHERE status = 'active'`)).toBe(1);
  expect(await count(`SELECT count(*)::int AS n FROM repos WHERE active`)).toBe(2);
  expect(await count(`SELECT count(*)::int AS n FROM slots WHERE state = 'pending'`)).toBe(8); // 2 h of */15
});

test('push removing the marker pauses scheduling right away', async () => {
  const s = setup();
  await s.install();
  s.gh.files.set('acme/app:.github/workflows/nightly.yml', wf(''));
  await handleEvent(s.deps, 'push', push(['.github/workflows/nightly.yml']));
  expect(await count(`SELECT count(*)::int AS n FROM schedules`)).toBe(0);
  expect(await count(`SELECT count(*)::int AS n FROM slots WHERE state = 'pending'`)).toBe(0);
});

test('push to another branch or without workflow changes does not sync', async () => {
  const s = setup();
  await s.install();
  s.gh.files.set('acme/app:.github/workflows/nightly.yml', wf(''));
  await handleEvent(s.deps, 'push', push(['.github/workflows/nightly.yml'], 'feature'));
  await handleEvent(s.deps, 'push', push(['src/index.ts']));
  expect(await count(`SELECT count(*)::int AS n FROM schedules`)).toBe(1);
});

test('deleted workflow file stops scheduling', async () => {
  const s = setup();
  await s.install();
  s.gh.workflows.set('acme/app', []);
  await handleEvent(s.deps, 'push', { ...push([]), commits: [{ added: [], modified: [], removed: ['.github/workflows/nightly.yml'] }] });
  expect(await count(`SELECT count(*)::int AS n FROM workflows WHERE present`)).toBe(0);
  expect(await count(`SELECT count(*)::int AS n FROM slots WHERE state = 'pending'`)).toBe(0);
});

test('uninstall: nothing is claimed afterwards', async () => {
  const s = setup();
  await s.install();
  await handleEvent(s.deps, 'installation', { action: 'deleted', installation: install });
  s.clock.now = new Date('2026-11-10T00:15:01Z');
  expect(await dispatchTick(s.deps)).toBe(0);
  expect(s.gh.dispatches).toHaveLength(0);
});

test('repo removed from the installation stops its schedules', async () => {
  const s = setup();
  await s.install();
  await handleEvent(s.deps, 'installation_repositories', { installation: install, repositories_removed: [{ id: 10 }], repositories_added: [] });
  expect(await count(`SELECT count(*)::int AS n FROM slots WHERE state = 'pending'`)).toBe(0);
});

test('flagged workflow is never activated: slots are skipped', async () => {
  const s = setup();
  s.gh.files.set('acme/app:.github/workflows/nightly.yml', `on:\n  push: # ontime: "*/15 * * * *"\njobs: {}\n`);
  await s.install();
  expect(await count(`SELECT count(*)::int AS n FROM slots WHERE state = 'pending'`)).toBe(0);
  expect(await count(`SELECT count(*)::int AS n FROM slots WHERE state = 'skipped'`)).toBe(8);
  const { rows } = await db.query('SELECT flags FROM workflows WHERE id = 100');
  expect(rows[0].flags[0].message).toMatch(/workflow_dispatch/);
});

test('end to end: install, fire, link run by time, conclusion recorded', async () => {
  const s = setup();
  await s.install();
  s.clock.now = new Date('2026-11-10T00:15:02Z');
  expect(await dispatchTick(s.deps)).toBe(1);
  expect(s.gh.dispatches[0]).toEqual({ repo: 'acme/app', workflowId: 100, ref: 'main' });
  const run = { id: 9, workflow_id: 100, event: 'workflow_dispatch', html_url: 'https://github.com/acme/app/actions/runs/9', status: 'queued', conclusion: null, created_at: '2026-11-10T00:15:03Z' };
  await handleEvent(s.deps, 'workflow_run', { action: 'requested', installation: install, workflow_run: run });
  await handleEvent(s.deps, 'workflow_run', { action: 'completed', installation: install, workflow_run: { ...run, status: 'completed', conclusion: 'success' } });
  const { rows } = await db.query(`SELECT state, run_id, matched_by, conclusion FROM slots WHERE run_id IS NOT NULL`);
  expect(rows).toEqual([{ state: 'accepted', run_id: 9, matched_by: 'time', conclusion: 'success' }]);
});

test('workflow_run from a push, or with nothing to match, is ignored', async () => {
  const s = setup();
  await s.install();
  const run = { id: 9, workflow_id: 100, event: 'push', html_url: '', status: 'queued', conclusion: null, created_at: T0.toISOString() };
  expect(await linkRun(db, run)).toBeNull();
  expect(await linkRun(db, { ...run, event: 'workflow_dispatch' })).toBeNull();
});

test('daily reconcile marks installations GitHub no longer lists as removed', async () => {
  const s = setup();
  await s.install();
  s.gh.installations = [];
  const { reconcileAll } = await import('../src/sync.js');
  await reconcileAll(s.deps);
  expect(await count(`SELECT count(*)::int AS n FROM installations WHERE removed`)).toBe(1);
});

test('a disabled workflow is treated as absent', async () => {
  const s = setup();
  s.gh.workflows.set('acme/app', [{ id: 100, path: '.github/workflows/nightly.yml', name: 'nightly', state: 'disabled_manually' }]);
  await s.install();
  expect(await count(`SELECT count(*)::int AS n FROM schedules`)).toBe(0);
  expect(await count(`SELECT count(*)::int AS n FROM slots`)).toBe(0);
});
