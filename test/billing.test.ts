import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import { downgradeLapsed, handleDodoWebhook, verifyDodoSignature } from '../src/billing.ts';
import { upsertInstallation, syncInstallation } from '../src/sync.ts';
import { fakeDeps } from './fakes.ts';
import { freshDb } from './helpers.ts';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const T0 = new Date('2026-11-12T10:00:00Z');
const SECRET = `whsec_${Buffer.from('test-signing-key-0123456789').toString('base64')}`;
const PRODUCTS = { pdt_pro_m: 'pro', pdt_pro_y: 'pro', pdt_team_m: 'team', pdt_team_y: 'team' } as const;
const cfg = { secret: SECRET, products: PRODUCTS };

const sign = (id: string, ts: number, body: string) =>
  `v1,${createHmac('sha256', Buffer.from(SECRET.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64')}`;

let seq = 0;
/** A signed delivery of a subscription event. */
function delivery(type: string, sub: Record<string, unknown>, opts: { at?: Date; sentAt?: Date; id?: string } = {}) {
  const at = opts.at ?? T0;
  const body = JSON.stringify({
    business_id: 'bus_1', type, timestamp: at.toISOString(),
    data: { payload_type: 'Subscription', subscription_id: 'sub_1', status: 'active', product_id: 'pdt_pro_m',
            customer: { customer_id: 'cus_1' }, next_billing_date: '2026-12-12T10:00:00Z', metadata: { installation_id: '1' }, ...sub },
  });
  const id = opts.id ?? `msg_${++seq}`;
  const ts = Math.floor((opts.sentAt ?? T0).getTime() / 1000);
  return { body, headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': sign(id, ts, body) } };
}

const wf = (crons: string[]) => `on:\n  workflow_dispatch:\n${crons.map((c) => `  # cronkick: "${c}"`).join('\n')}\njobs: {}\n`;
async function install(type: 'User' | 'Organization', crons: string[] = []) {
  const f = fakeDeps(db, T0);
  await upsertInstallation(f.deps, { id: 1, account: { login: 'devesh', type } });
  f.gh.repos.push({ id: 10, fullName: 'devesh/app', defaultBranch: 'main' });
  f.gh.workflows.set('devesh/app', [{ id: 100, path: '.github/workflows/a.yml', name: 'a' }]);
  f.gh.files.set('devesh/app:.github/workflows/a.yml', wf(crons));
  await syncInstallation(f.deps, 1);
  return f;
}
const row = async () => (await db.query('SELECT plan, dodo_customer_id, dodo_subscription_id, subscription_status, paid_through FROM installations WHERE id = 1')).rows[0];
const statuses = async () => (await db.query(`SELECT status, count(*)::int AS n FROM schedules GROUP BY status ORDER BY status`)).rows;
const FIVE = ['0 1 * * *', '0 2 * * *', '0 3 * * *', '0 4 * * *', '0 5 * * *'];

test('signature: valid, several signatures, bad, missing, stale', () => {
  const now = T0;
  const d = delivery('subscription.active', {});
  expect(verifyDodoSignature(SECRET, d.headers, d.body, now)).toBe(true);
  expect(verifyDodoSignature(SECRET, { ...d.headers, 'webhook-signature': `v1,AAAA ${d.headers['webhook-signature']}` }, d.body, now)).toBe(true);
  expect(verifyDodoSignature(SECRET, d.headers, d.body.replace('pdt_pro_m', 'pdt_team_m'), now)).toBe(false);
  expect(verifyDodoSignature(SECRET, { ...d.headers, 'webhook-signature': undefined }, d.body, now)).toBe(false);
  expect(verifyDodoSignature(SECRET, d.headers, d.body, new Date(T0.getTime() + 10 * 60_000))).toBe(false);
});

test('a bad signature is refused and changes nothing', async () => {
  const f = await install('User');
  const d = delivery('subscription.active', {});
  const res = await handleDodoWebhook(f.deps, cfg, { ...d.headers, 'webhook-signature': 'v1,nope' }, d.body);
  expect(res.status).toBe(401);
  expect((await row()).plan).toBe('free');
  expect((await db.query('SELECT count(*)::int AS n FROM billing_events')).rows[0].n).toBe(0);
});

test('active Pro on a personal account: Pro, ids stored, limits lifted', async () => {
  const f = await install('User', FIVE);
  expect(await statuses()).toEqual([{ status: 'active', n: 3 }, { status: 'paused_limit', n: 2 }]);
  const d = delivery('subscription.active', {});
  expect((await handleDodoWebhook(f.deps, cfg, d.headers, d.body)).status).toBe(200);
  expect(await row()).toMatchObject({ plan: 'pro', dodo_customer_id: 'cus_1', dodo_subscription_id: 'sub_1', subscription_status: 'active' });
  expect((await row()).paid_through.toISOString()).toBe('2026-12-12T10:00:00.000Z');
  expect(await statuses()).toEqual([{ status: 'active', n: 5 }]);
});

test('the same delivery twice is applied once', async () => {
  const f = await install('User');
  const d = delivery('subscription.active', {});
  await handleDodoWebhook(f.deps, cfg, d.headers, d.body);
  await db.query(`UPDATE installations SET plan = 'free'`); // would be undone by a second apply
  expect((await handleDodoWebhook(f.deps, cfg, d.headers, d.body)).status).toBe(200);
  expect((await row()).plan).toBe('free');
});

test('past_due keeps the plan; on_hold drops to Free and pauses over the limit', async () => {
  const f = await install('User', FIVE);
  for (const [type, status, at] of [['subscription.active', 'active', 0], ['subscription.past_due', 'past_due', 1]] as const) {
    const d = delivery(type, { status }, { at: new Date(T0.getTime() + at * 1000) });
    await handleDodoWebhook(f.deps, cfg, d.headers, d.body);
  }
  expect(await row()).toMatchObject({ plan: 'pro', subscription_status: 'past_due' });
  const hold = delivery('subscription.on_hold', { status: 'on_hold' }, { at: new Date(T0.getTime() + 2000) });
  await handleDodoWebhook(f.deps, cfg, hold.headers, hold.body);
  expect((await row()).plan).toBe('free');
  expect(await statuses()).toEqual([{ status: 'active', n: 3 }, { status: 'paused_limit', n: 2 }]);
});

test('cancelled keeps the plan until paid_through, then maintenance drops it', async () => {
  const f = await install('User', FIVE);
  const a = delivery('subscription.active', {});
  await handleDodoWebhook(f.deps, cfg, a.headers, a.body);
  const c = delivery('subscription.cancelled', { status: 'cancelled' }, { at: new Date(T0.getTime() + 1000) });
  await handleDodoWebhook(f.deps, cfg, c.headers, c.body);
  expect(await row()).toMatchObject({ plan: 'pro', subscription_status: 'cancelled' });

  await downgradeLapsed(f.deps, new Date('2026-12-01T00:00:00Z'));
  expect((await row()).plan).toBe('pro');
  await downgradeLapsed(f.deps, new Date('2026-12-13T00:00:00Z'));
  expect((await row()).plan).toBe('free');
  expect(await statuses()).toEqual([{ status: 'active', n: 3 }, { status: 'paused_limit', n: 2 }]);
});

test('an older event delivered late does not undo a newer one', async () => {
  const f = await install('User');
  const hold = delivery('subscription.on_hold', { status: 'on_hold' }, { at: new Date(T0.getTime() + 5000) });
  const active = delivery('subscription.active', {}, { at: T0 });
  await handleDodoWebhook(f.deps, cfg, hold.headers, hold.body);
  await handleDodoWebhook(f.deps, cfg, active.headers, active.body);
  expect((await row()).plan).toBe('free');
});

test('an event for an old subscription does not touch the current one', async () => {
  const f = await install('User');
  const a = delivery('subscription.active', { subscription_id: 'sub_new' });
  await handleDodoWebhook(f.deps, cfg, a.headers, a.body);
  const old = delivery('subscription.expired', { subscription_id: 'sub_old', status: 'expired' }, { at: new Date(T0.getTime() + 1000) });
  await handleDodoWebhook(f.deps, cfg, old.headers, old.body);
  expect(await row()).toMatchObject({ plan: 'pro', dodo_subscription_id: 'sub_new' });
});

test('Team on an organization, with every-minute schedules', async () => {
  const f = await install('Organization', ['* * * * *']);
  expect((await db.query('SELECT flags FROM workflows')).rows[0].flags[0].message).toMatch(/every 1 min/);
  const d = delivery('subscription.active', { product_id: 'pdt_team_y' });
  await handleDodoWebhook(f.deps, cfg, d.headers, d.body);
  expect((await row()).plan).toBe('team');
  expect((await db.query('SELECT flags FROM workflows')).rows[0].flags).toEqual([]);
});

test('a product that does not match the account type changes no plan', async () => {
  const f = await install('Organization');
  const d = delivery('subscription.active', { product_id: 'pdt_pro_m' });
  expect((await handleDodoWebhook(f.deps, cfg, d.headers, d.body)).status).toBe(200);
  expect((await row()).plan).toBe('free');
});

test('unknown product, unknown installation and other event types are acknowledged and ignored', async () => {
  const f = await install('User');
  for (const d of [
    delivery('subscription.active', { product_id: 'pdt_other' }),
    delivery('subscription.active', { metadata: { installation_id: '999' } }),
    delivery('payment.succeeded', {}),
  ]) expect((await handleDodoWebhook(f.deps, cfg, d.headers, d.body)).status).toBe(200);
  expect((await row()).plan).toBe('free');
});

test('a later event without metadata finds the installation by subscription id', async () => {
  const f = await install('User');
  const a = delivery('subscription.active', {});
  await handleDodoWebhook(f.deps, cfg, a.headers, a.body);
  const h = delivery('subscription.on_hold', { status: 'on_hold', metadata: {} }, { at: new Date(T0.getTime() + 1000) });
  await handleDodoWebhook(f.deps, cfg, h.headers, h.body);
  expect((await row()).plan).toBe('free');
});

test('a comped installation (no subscription) is never downgraded by maintenance', async () => {
  const f = await install('User');
  await db.query(`UPDATE installations SET plan = 'pro'`);
  await downgradeLapsed(f.deps, new Date('2030-01-01Z'));
  expect((await row()).plan).toBe('pro');
});

test('no secret configured: every delivery is refused', async () => {
  const f = await install('User');
  const d = delivery('subscription.active', {});
  expect((await handleDodoWebhook(f.deps, { ...cfg, secret: '' }, d.headers, d.body)).status).toBe(503);
});
