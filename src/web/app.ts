import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Deps } from '../deps.ts';
import { handleDodoWebhook, type BillingConfig } from '../billing.ts';
import { handleEvent, verifySignature } from '../webhooks.ts';
import { BadToken, jwksCache, MAX_BODY, storeReceipt, verifyActionsOidc, type KeySource } from '../receipts.ts';

/** The worker's HTTP surface: GitHub webhooks and the health check. Pages live in the Next app (web/). */
export function webApp(deps: Deps, opts: { webhookSecret: string; billing: BillingConfig; oidcKeys?: KeySource }) {
  const app = new Hono();
  const oidcKeys = opts.oidcKeys ?? jwksCache();

  // Liveness for the load balancer: this server and the database answer. Keep it cheap and unconditional.
  app.get('/healthz', async (c) => { await deps.db.query('SELECT 1'); return c.text('ok'); });
  // For the uptime monitor only: due slots are being picked up. A slot still waiting 2 minutes after it could
  // have been sent means no dispatcher is working, an outage for this product even while the site loads.
  // A planner that stopped advancing (or never planned at all), or a lease nobody settled, is the same outage seen earlier.
  // Settle runs about once a minute, so a lease is stranded only once it is 3 min past.
  // (Not used by the load balancer, or one lagging minute would take the whole site offline.)
  app.get('/healthz/dispatch', async (c) => {
    const { rows: [r] } = await deps.db.query(
      // `waiting` uses claim()'s filter: a slot of a paused repo or suspended install is never sent, so it isn't lag.
      `SELECT (SELECT count(*)::int FROM slots s JOIN repos r ON r.id = s.repo_id JOIN installations i ON i.id = s.installation_id
                WHERE s.state = 'pending' AND s.next_attempt_at < $1::timestamptz - interval '2 minutes'
                  AND r.active AND NOT i.removed AND NOT i.suspended) AS waiting,
              (SELECT count(*)::int FROM slots WHERE state = 'dispatching' AND lease_until < $1::timestamptz - interval '3 minutes') AS stranded,
              (SELECT planned_until IS NULL OR planned_until < $1::timestamptz + interval '115 minutes' FROM planner) AS stale -- 2 h horizon less 5 min`, [deps.now()]);
    const n = r.waiting as number;
    const problem = r.stale ? 'planner stalled: slots are not being planned ahead'
      : r.stranded ? `dispatch stuck: ${r.stranded} lease${r.stranded === 1 ? '' : 's'} expired over 3 min ago`
      : n ? `dispatch lagging: ${n} slot${n === 1 ? '' : 's'} waiting over 2 min` : null;
    if (!problem) return c.text('ok');
    // Logged so an uptime alert can be told apart from a probe-side network blip (no line = the app was fine).
    console.warn(`healthz/dispatch 503: ${problem}`);
    return c.text(problem, 503);
  });

  app.post('/webhooks', async (c) => {
    const body = await c.req.text();
    if (!verifySignature(opts.webhookSecret, body, c.req.header('x-hub-signature-256'))) return c.text('bad signature', 401);
    const event = c.req.header('x-github-event') ?? '';
    try {
      await handleEvent(deps, event, JSON.parse(body));
    } catch (e) {
      console.error(`webhook ${event} failed`, e);
      Sentry.captureException(e, { tags: { webhook: event } });
      return c.text('error', 500);
    }
    return c.text('ok');
  });

  // Dodo Payments: subscription changes set the plan (src/billing.ts).
  app.post('/webhooks/dodo', async (c) => {
    const body = await c.req.text();
    try {
      const r = await handleDodoWebhook(deps, opts.billing, c.req.header(), body);
      return c.text(r.text, r.status as 200);
    } catch (e) {
      console.error('dodo webhook failed', e);
      Sentry.captureException(e, { tags: { webhook: 'dodo' } });
      return c.text('error', 500);
    }
  });

  // Run receipts from agent recipes (src/receipts.ts). The token is never logged.
  // The body is counted as it streams in, so a chunked upload without content-length can't fill memory either.
  app.post('/receipts', bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.text('body too large', 400) }), async (c) => {
    const token = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
    if (!token) return c.text('missing token', 401);
    let claims;
    try {
      claims = await verifyActionsOidc(token, deps.baseUrl.replace(/\/+$/, ''), deps.now(), oidcKeys);
    } catch (e) {
      if (e instanceof BadToken) return c.text(`bad token: ${e.message}`, 401);
      console.error('receipt: JWKS unavailable', (e as Error).message);
      return c.text('cannot verify right now', 503);
    }
    const status = await storeReceipt(deps.db, claims, await c.req.text());
    return status === 204 ? c.body(null, 204) : c.text(status === 400 ? 'bad receipt' : 'no matching run', status);
  });

  return app;
}
