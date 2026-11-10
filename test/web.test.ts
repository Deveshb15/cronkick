import { afterAll, beforeEach, expect, test } from 'vitest';
import { generateSignedCookie } from 'hono/cookie';
import { createHmac } from 'node:crypto';
import type { Db } from '../src/db.js';
import { webApp } from '../src/web/app.js';
import { fakeDeps } from './fakes.js';
import { freshDb, seed } from './helpers.js';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const T0 = new Date('2026-11-10T12:00:00Z');
const opts = { webhookSecret: 'whsec', sessionSecret: 'sess', appSlug: 'ontime', contactEmail: 'hi@ontime.test', oauth: { authorizeUrl: (s: string) => `https://github.com/login/oauth/authorize?state=${s}`, exchange: async () => ({ login: 'octo', installs: [1] }) } };

async function cookieFor(installs: number[]) {
  const c = await generateSignedCookie('ontime_session', JSON.stringify({ login: 'octo', installs, exp: Date.now() + 60_000 }), 'sess');
  return c.split(';')[0];
}
function app() {
  const f = fakeDeps(db, T0);
  return { ...f, app: webApp(f.deps, opts) };
}
async function slots(n: number, state = 'fired') {
  for (let i = 1; i <= n; i++) {
    const due = new Date(T0.getTime() - i * 60_000);
    await db.query(`INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state) VALUES (1, 10, 100, $1, $1, $1, $1, $2)`, [due, state]);
  }
}

test('no session: redirect to /login', async () => {
  const res = await app().app.request('/i/1');
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('/login');
});

test('installation the user cannot access: 404', async () => {
  await seed(db);
  const res = await app().app.request('/i/1', { headers: { cookie: await cookieFor([2]) } });
  expect(res.status).toBe(404);
});

test('workflow of another installation: 404 even with a valid session', async () => {
  await seed(db);
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  const res = await app().app.request('/i/2/w/100', { headers: { cookie: await cookieFor([2]) } });
  expect(res.status).toBe(404);
});

test('slot table shows unknown and expired, with full counts', async () => {
  await seed(db, { plan: 'pro' });
  await slots(3, 'fired');
  await db.query(`UPDATE slots SET state = 'unknown' WHERE id = 1`);
  await db.query(`UPDATE slots SET state = 'expired' WHERE id = 2`);
  const res = await app().app.request('/i/1/w/100', { headers: { cookie: await cookieFor([1]) } });
  const body = await res.text();
  expect(res.status).toBe(200);
  expect(body).toContain('3 slots');
  expect(body).toContain('unknown 1');
  expect(body).toContain('expired 1');
});

test('Free sees the last 20 slots', async () => {
  await seed(db, { plan: 'free' });
  await slots(25);
  const body = await (await app().app.request('/i/1/w/100', { headers: { cookie: await cookieFor([1]) } })).text();
  expect(body).toContain('20 slots');
});

test('repo names are escaped', async () => {
  await seed(db);
  await db.query(`UPDATE repos SET full_name = '<script>x</script>'`);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '0 * * * *')`);
  const body = await (await app().app.request('/i/1', { headers: { cookie: await cookieFor([1]) } })).text();
  expect(body).not.toContain('<script>x</script>');
  expect(body).toContain('&lt;script&gt;');
});

test('webhook with a bad signature: 401 and nothing written', async () => {
  const body = JSON.stringify({ action: 'created', installation: { id: 1, account: { login: 'a', type: 'User' } } });
  const res = await app().app.request('/webhooks', { method: 'POST', body, headers: { 'x-github-event': 'installation', 'x-hub-signature-256': 'sha256=00' } });
  expect(res.status).toBe(401);
  expect((await db.query('SELECT count(*)::int AS n FROM installations')).rows[0].n).toBe(0);
});

test('signed webhook is handled', async () => {
  const body = JSON.stringify({ action: 'created', installation: { id: 1, account: { login: 'a', type: 'User' } } });
  const sig = `sha256=${createHmac('sha256', 'whsec').update(body).digest('hex')}`;
  const res = await app().app.request('/webhooks', { method: 'POST', body, headers: { 'x-github-event': 'installation', 'x-hub-signature-256': sig } });
  expect(res.status).toBe(200);
  expect((await db.query('SELECT count(*)::int AS n FROM installations')).rows[0].n).toBe(1);
});

test('login flow: state is checked', async () => {
  const a = app().app;
  const login = await a.request('/login');
  const state = new URL(login.headers.get('location')!).searchParams.get('state');
  const stateCookie = login.headers.get('set-cookie')!.split(';')[0];
  expect((await a.request(`/callback?code=c&state=wrong`, { headers: { cookie: stateCookie } })).status).toBe(400);
  const ok = await a.request(`/callback?code=c&state=${state}`, { headers: { cookie: stateCookie } });
  expect(ok.status).toBe(302);
  expect(ok.headers.get('set-cookie')).toContain('ontime_session');
});

test('lateness page says collecting when there is no data', async () => {
  const body = await (await app().app.request('/lateness')).text();
  expect(body).toContain('Collecting data');
});

test('Pro: counts cover the whole window even when the table is capped', async () => {
  await seed(db, { plan: 'pro' });
  await db.query(`INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state)
    SELECT 1, 10, 100, t, t, t, t, 'fired' FROM generate_series($1::timestamptz - interval '600 minutes', $1::timestamptz - interval '1 minute', interval '1 minute') t`, [T0]);
  const body = await (await app().app.request('/i/1/w/100', { headers: { cookie: await cookieFor([1]) } })).text();
  expect(body).toContain('600 slots');
  expect(body).toContain('newest 500 shown');
  expect(body.match(/<tr>/g)!.length).toBe(501); // header + 500
});

test('privacy and terms pages are public', async () => {
  const a = app().app;
  for (const path of ['/privacy', '/terms']) {
    const res = await a.request(path);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('hi@ontime.test');
  }
});
