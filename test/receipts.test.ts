import { afterAll, beforeEach, expect, test } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { Db } from '../src/db.ts';
import { ISSUER, jwksCache, parseReceipt, repoUrl } from '../src/receipts.ts';
import { webApp } from '../src/web/app.ts';
import { receiptLine } from '../web/lib/live.ts';
import { fakeDeps } from './fakes.ts';
import { freshDb, seed } from './helpers.ts';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const NOW = new Date('2026-11-14T12:00:00Z');
const t = NOW.getTime() / 1000;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] };
let fetches = 0;
const keys = () => jwksCache(async () => { fetches++; return jwks; });

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims: object = {}, opts: { kid?: string; key?: typeof privateKey } = {}) {
  const head = b64({ alg: 'RS256', typ: 'JWT', kid: opts.kid ?? 'k1' });
  const body = b64({ iss: ISSUER, aud: 'https://cronkick.test', exp: t + 300, nbf: t - 10, repository_id: '10', repository: 'acme/app', run_id: '555', ...claims });
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), opts.key ?? privateKey).toString('base64url')}`;
}
const receipt = (o: object = {}) => JSON.stringify({ v: 1, recipe: 'nightly-deps', engine: 'claude', outcome: 'pr', url: 'https://github.com/acme/app/pull/7', turns: 22, cost_usd: 0.84, ...o });

const app = () => webApp(fakeDeps(db, NOW).deps, { webhookSecret: 'x', billing: { secret: '', products: {} }, oidcKeys: keys() });
const post = (a: ReturnType<typeof webApp>, token: string, body = receipt()) =>
  a.request('/receipts', { method: 'POST', body, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
const stored = async (runId = 555) => (await db.query('SELECT receipt FROM slots WHERE run_id = $1', [runId])).rows[0]?.receipt;

async function slots() {
  await seed(db); // installation 1, repo 10 acme/app, workflow 100
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  await db.query(`UPDATE repos SET full_name = 'other/app' WHERE id = 20`);
  const slot = (repo: number, wf: number, inst: number, run: number) => db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, run_id)
     VALUES ($1, $2, $3, $4, $4, $4, $4, 'accepted', $5)`, [inst, repo, wf, NOW, run]);
  await slot(10, 100, 1, 555);
  await slot(20, 200, 2, 777);
}

test('a valid receipt is stored on its slot once; the first one wins', async () => {
  await slots();
  const a = app();
  expect((await post(a, jwt())).status).toBe(204);
  expect(await stored()).toEqual({ v: 1, recipe: 'nightly-deps', engine: 'claude', outcome: 'pr', url: 'https://github.com/acme/app/pull/7', turns: 22, cost_usd: 0.84 });
  expect((await post(a, jwt(), receipt({ outcome: 'noop', url: undefined }))).status).toBe(204);
  expect((await stored()).outcome).toBe('pr');
  expect((await db.query('SELECT receipt_at FROM slots WHERE run_id = 555')).rows[0].receipt_at).not.toBeNull();
});

test('bad tokens are refused with 401 and nothing is stored', async () => {
  await slots();
  const a = app();
  const good = jwt();
  const [h, p] = good.split('.');
  for (const token of [
    jwt({ aud: 'https://evil.example' }),
    jwt({ iss: 'https://evil.example' }),
    jwt({ exp: t - 61 }),
    jwt({ nbf: t + 120 }),
    jwt({}, { kid: 'nope' }),
    jwt({}, { key: other.privateKey }),
    `${h}.${b64({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), run_id: '777', repository_id: '20' })}.${good.split('.')[2]}`, // tampered claims
    'not-a-jwt',
  ]) expect((await post(a, token)).status).toBe(401);
  expect((await a.request('/receipts', { method: 'POST', body: receipt() })).status).toBe(401);
  expect(await stored()).toBeNull();
});

test('the clock skew allowance is 60 s', async () => {
  await slots();
  expect((await post(app(), jwt({ exp: t - 30 }))).status).toBe(204);
});

test('an unknown kid refetches the keys at most once a minute', async () => {
  fetches = 0;
  const k = keys();
  expect(await k('k1', 0)).toBeDefined();
  expect(await k('nope', 1_000)).toBeUndefined();
  expect(fetches).toBe(1);
  expect(await k('nope', 61_001)).toBeUndefined();
  expect(fetches).toBe(2);
});

test('a run Cronkick did not start in that repo, or an inactive repo, is 404', async () => {
  await slots();
  const a = app();
  expect((await post(a, jwt({ run_id: '777' }))).status).toBe(404); // another installation's run, claimed from repo 10
  expect((await post(a, jwt({ run_id: '999' }))).status).toBe(404); // a manual run: no slot
  await db.query('UPDATE repos SET active = false WHERE id = 10');
  expect((await post(a, jwt())).status).toBe(404);
  await db.query('UPDATE repos SET active = true WHERE id = 10');
  await db.query('UPDATE installations SET removed = true WHERE id = 1');
  expect((await post(a, jwt())).status).toBe(404);
  expect(await stored()).toBeNull();
});

test('bad bodies are 400', async () => {
  await slots();
  const a = app();
  for (const body of [
    receipt({ reason: 'x'.repeat(3000) }), // over 2 KB
    receipt({ outcome: 'hacked' }),
    receipt({ url: 'https://github.com/other/app/pull/1' }),
    receipt({ url: 'https://github.com/acme/app/../../other/app/pull/1' }),
    receipt({ url: 'javascript:alert(1)' }),
    receipt({ cost_usd: -1 }),
    receipt({ turns: 'many' }),
    receipt({ v: 2 }),
    receipt({ recipe: '<script>' }),
    '{not json',
  ]) expect((await post(a, jwt(), body)).status).toBe(400);
  expect(await stored()).toBeNull();
});

test('a chunked body over 2 KB with no content-length is cut off with 400, before the token is checked', async () => {
  const chunk = new TextEncoder().encode('x'.repeat(1024));
  const body = new ReadableStream({ start(c) { for (let i = 0; i < 64; i++) c.enqueue(chunk); c.close(); } });
  const res = await app().request(new Request('http://x/receipts', { method: 'POST', body, headers: { authorization: 'Bearer junk' }, duplex: 'half' } as RequestInit));
  expect(res.status).toBe(400);
});

test('only whitelisted fields are kept', () => {
  expect(parseReceipt(receipt({ outcome: 'skipped', url: undefined, turns: null, cost_usd: null, reason: 'open PR\nwaiting', token: 'secret', extra: 1 })))
    .toEqual({ v: 1, recipe: 'nightly-deps', engine: 'claude', outcome: 'skipped', reason: 'open PR waiting' });
  expect(repoUrl('https://github.com/Acme/App/issues?q=label%3A%22x%22', 'acme/app')).toBe('https://github.com/Acme/App/issues?q=label%3A%22x%22');
  expect(repoUrl('https://github.com/acme/application/pull/1', 'acme/app')).toBeNull();
});

test('history rows say what the receipt says', () => {
  expect(receiptLine({ v: 1, recipe: 'r', engine: 'claude', outcome: 'pr', url: 'https://github.com/a/b/pull/1', turns: 22, cost_usd: 0.84 }))
    .toEqual({ text: 'Opened PR · $0.84 · 22 turns', url: 'https://github.com/a/b/pull/1' });
  expect(receiptLine({ v: 1, recipe: 'r', engine: 'codex', outcome: 'skipped', reason: 'open PR waiting for review' })).toEqual({ text: 'Skipped: open PR waiting for review', url: null });
  expect(receiptLine({ v: 1, recipe: 'r', engine: 'claude', outcome: 'noop', turns: 1 })!.text).toBe('No changes · 1 turn');
  expect(receiptLine(null)).toBeNull();
});
