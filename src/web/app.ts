import { Hono } from 'hono';
import type { Deps } from '../deps.ts';
import { handleEvent, verifySignature } from '../webhooks.ts';

/** The worker's HTTP surface: GitHub webhooks and the health check. Pages live in the Next app (web/). */
export function webApp(deps: Deps, opts: { webhookSecret: string }) {
  const app = new Hono();

  app.get('/healthz', async (c) => { await deps.db.query('SELECT 1'); return c.text('ok'); });

  app.post('/webhooks', async (c) => {
    const body = await c.req.text();
    if (!verifySignature(opts.webhookSecret, body, c.req.header('x-hub-signature-256'))) return c.text('bad signature', 401);
    const event = c.req.header('x-github-event') ?? '';
    try {
      await handleEvent(deps, event, JSON.parse(body));
    } catch (e) {
      console.error(`webhook ${event} failed`, e);
      return c.text('error', 500);
    }
    return c.text('ok');
  });

  return app;
}
