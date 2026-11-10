import { afterAll, beforeEach, expect, test } from 'vitest';
import { createHmac } from 'node:crypto';
import type { Db } from '../src/db.ts';
import { webApp } from '../src/web/app.ts';
import { fakeDeps } from './fakes.ts';
import { freshDb } from './helpers.ts';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const app = () => webApp(fakeDeps(db, new Date('2026-11-10T12:00:00Z')).deps, { webhookSecret: 'whsec' });
const body = JSON.stringify({ action: 'created', installation: { id: 1, account: { login: 'a', type: 'User' } } });

test('webhook with a bad signature: 401 and nothing written', async () => {
  const res = await app().request('/webhooks', { method: 'POST', body, headers: { 'x-github-event': 'installation', 'x-hub-signature-256': 'sha256=00' } });
  expect(res.status).toBe(401);
  expect((await db.query('SELECT count(*)::int AS n FROM installations')).rows[0].n).toBe(0);
});

test('signed webhook is handled', async () => {
  const sig = `sha256=${createHmac('sha256', 'whsec').update(body).digest('hex')}`;
  const res = await app().request('/webhooks', { method: 'POST', body, headers: { 'x-github-event': 'installation', 'x-hub-signature-256': sig } });
  expect(res.status).toBe(200);
  expect((await db.query('SELECT count(*)::int AS n FROM installations')).rows[0].n).toBe(1);
});

test('healthz checks the database', async () => {
  expect(await (await app().request('/healthz')).text()).toBe('ok');
});
