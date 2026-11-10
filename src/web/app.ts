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
  // (Not used by the load balancer, or one lagging minute would take the whole site offline.)
  app.get('/healthz/dispatch', async (c) => {
    const { rows } = await deps.db.query(
      `SELECT count(*)::int AS n FROM slots WHERE state = 'pending' AND next_attempt_at < $1::timestamptz - interval '2 minutes'`, [deps.now()]);
    const n = rows[0].n as number;
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
