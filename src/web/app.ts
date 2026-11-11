import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import type { Deps } from '../deps.ts';
import { handleEvent, verifySignature } from '../webhooks.ts';

/** The worker's HTTP surface: GitHub webhooks and the health check. Pages live in the Next app (web/). */
export function webApp(deps: Deps, opts: { webhookSecret: string }) {
  const app = new Hono();

  // Liveness for the load balancer: this server and the database answer. Keep it cheap and unconditional.
  app.get('/healthz', async (c) => { await deps.db.query('SELECT 1'); return c.text('ok'); });
  // For the uptime monitor only: due slots are being picked up. A slot still waiting 2 minutes after it could
  // have been sent means no dispatcher is working, an outage for this product even while the site loads.
  // A planner that stopped advancing (or never planned at all), or a lease nobody settled, is the same outage seen earlier.
  // Settle runs about once a minute, so a lease is stranded only once it is 3 min past.
  // (Not used by the load balancer, or one lagging minute would take the whole site offline.)
  app.get('/healthz/dispatch', async (c) => {
    const { rows: [r] } = await deps.db.query(
      `SELECT (SELECT count(*)::int FROM slots WHERE state = 'pending' AND next_attempt_at < $1::timestamptz - interval '2 minutes') AS waiting,
              (SELECT count(*)::int FROM slots WHERE state = 'dispatching' AND lease_until < $1::timestamptz - interval '3 minutes') AS stranded,
              (SELECT planned_until IS NULL OR planned_until < $1::timestamptz + interval '115 minutes' FROM planner) AS stale -- 2 h horizon less 5 min`, [deps.now()]);
    if (r.stale) return c.text('planner stalled: slots are not being planned ahead', 503);
    if (r.stranded) return c.text(`dispatch stuck: ${r.stranded} lease${r.stranded === 1 ? '' : 's'} expired over 3 min ago`, 503);
    const n = r.waiting as number;
    return n ? c.text(`dispatch lagging: ${n} slot${n === 1 ? '' : 's'} waiting over 2 min`, 503) : c.text('ok');
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

  return app;
}
