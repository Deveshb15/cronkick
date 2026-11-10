import { Hono } from 'hono';
import { html } from 'hono/html';
import { getCookie, setCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import type { Deps } from '../deps.js';
import { handleEvent, verifySignature } from '../webhooks.js';
import { PLANS, planOf } from '../plans.js';
import { probeReport } from '../probe/collector.js';
import { clearSession, readSession, writeSession, type OAuth, type Session } from './auth.js';
import { latenessPage, page, slotTable, stateCounts } from './views.js';
import { privacyPage, termsPage } from './legal.js';

const MAX_ROWS = 500;

export type WebOpts = { webhookSecret: string; sessionSecret: string; oauth: OAuth; appSlug: string; contactEmail: string };

export function webApp(deps: Deps, opts: WebOpts) {
  const app = new Hono<{ Variables: { session: Session } }>();
  const secure = deps.baseUrl.startsWith('https://');
  const db = deps.db;

  app.get('/healthz', async (c) => { await db.query('SELECT 1'); return c.text('ok'); });

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

  app.get('/', async (c) => {
    const s = await readSession(c, opts.sessionSecret);
    return c.html(page('Cronkick: on-time cron for GitHub Actions', html`
<h1>Keep your cron in your repo. Cronkick triggers it on time.</h1>
<p>GitHub's <code>schedule:</code> trigger is best-effort and has been dropping runs. Cronkick calls <code>workflow_dispatch</code> on our own clock.
No personal access token, nothing to configure outside your workflow file, and a record of every slot.</p>
<pre>on:
  workflow_dispatch: # cronkick: "17 * * * *"
  # cronkick: "0 9 * * 1-5" tz=Europe/Berlin</pre>
<p><a href="https://github.com/apps/${opts.appSlug}/installations/new"><button>Install the GitHub App</button></a>
${s ? html` <a href="/dashboard">Your dashboard</a>` : ''}</p>
<p class="muted">Free: 1 repo, 3 schedules, every 15 min or slower. Pro: $9/mo or $90/yr, 50 schedules, every 5 min, email alerts, 90-day history.
We control the trigger, not GitHub's runners; when GitHub's API fails we show it instead of hiding it.</p>
<p><a href="/lateness">How late is GitHub's own scheduler right now?</a></p>`, s?.login));
  });

  app.get('/login', (c) => {
    const state = randomBytes(16).toString('hex');
    setCookie(c, 'oauth_state', state, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: 600 });
    return c.redirect(opts.oauth.authorizeUrl(state));
  });

  app.get('/callback', async (c) => {
    const { code, state } = c.req.query();
    if (!code || !state || state !== getCookie(c, 'oauth_state')) return c.text('Sign-in expired. Try again.', 400);
    const who = await opts.oauth.exchange(code);
    await writeSession(c, opts.sessionSecret, who, secure);
    return c.redirect('/dashboard');
  });

  app.get('/privacy', async (c) => c.html(privacyPage(opts.contactEmail, (await readSession(c, opts.sessionSecret))?.login)));
  app.get('/terms', async (c) => c.html(termsPage(opts.contactEmail, (await readSession(c, opts.sessionSecret))?.login)));

  app.get('/logout', (c) => { clearSession(c); return c.redirect('/'); });

  app.get('/lateness', async (c) => {
    const s = await readSession(c, opts.sessionSecret);
    return c.html(latenessPage(await probeReport(db, deps.now()), s?.login));
  });

  // Everything below needs a session, and only shows installations GitHub says the user can access (P1).
  const authed = new Hono<{ Variables: { session: Session } }>();
  // Registered per path so `:id` is available to the access check.
  authed.use('/dashboard', guard);
  authed.use('/i/:id', guard);
  authed.use('/i/:id/*', guard);
  async function guard(c: any, next: () => Promise<void>) {
    const s = await readSession(c, opts.sessionSecret);
    if (!s) return c.redirect('/login');
    c.set('session', s);
    const id = c.req.param('id');
    if (id !== undefined && !s.installs.includes(Number(id))) return c.text('Not found', 404);
    await next();
  }

  authed.get('/dashboard', async (c) => {
    const s = c.get('session');
    const { rows } = await db.query('SELECT id, account_login, plan FROM installations WHERE id = ANY($1) AND NOT removed ORDER BY account_login', [s.installs]);
    return c.html(page('Dashboard · Cronkick', html`<h1>Your installations</h1>
${rows.length ? html`<ul>${rows.map((r) => html`<li><a href="/i/${r.id}">${r.account_login}</a> <span class="pill">${r.plan}</span></li>`)}</ul>`
    : html`<p>No installations yet. <a href="https://github.com/apps/${opts.appSlug}/installations/new">Install the App</a>, then sign in again.</p>`}`, s.login));
  });

  authed.get('/i/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const inst = (await db.query('SELECT * FROM installations WHERE id = $1', [id])).rows[0];
    if (!inst) return c.text('Not found', 404);
    const { rows } = await db.query(
      `SELECT w.id, w.name, w.path, w.flags, w.suggested_diff, r.full_name,
              coalesce(json_agg(json_build_object('cron', s.cron, 'tz', s.tz, 'status', s.status) ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '[]') AS schedules
         FROM workflows w JOIN repos r ON r.id = w.repo_id LEFT JOIN schedules s ON s.workflow_id = w.id
        WHERE r.installation_id = $1 AND r.active AND w.present
        GROUP BY w.id, r.full_name ORDER BY r.full_name, w.path`,
      [id],
    );
    const relevant = rows.filter((w) => w.schedules.length || w.flags.length || w.suggested_diff);
    const limits = PLANS[inst.plan as 'free' | 'pro'];
    return c.html(page(`${inst.account_login} · Cronkick`, html`
<h1>${inst.account_login} <span class="pill">${inst.plan}</span></h1>
<p class="muted">Limits: ${limits.repos === Infinity ? 'any number of repos' : `${limits.repos} repo`}, ${limits.schedules} schedules, every ${limits.floorMinutes} min or slower.
Schedules over the limit are paused, never charged.</p>
<form method="post" action="/i/${id}/email"><label>Alert email <input type="email" name="email" value="${inst.alert_email ?? ''}" required></label> <button>Save</button>
${inst.plan === 'free' ? html` <span class="muted">Free accounts get only plan-limit emails; slot alerts are Pro.</span>` : ''}</form>
<h2>Workflows</h2>
${relevant.length ? relevant.map((w) => html`<section>
<h3><a href="/i/${id}/w/${w.id}">${w.full_name} · ${w.name}</a> <span class="muted">${w.path}</span></h3>
${w.schedules.map((s: any) => html`<div><code>${s.cron}</code> ${s.tz} <span class="pill">${w.flags.length ? 'not active (see below)' : s.status === 'paused_limit' ? 'paused: plan limit' : 'active'}</span></div>`)}
${w.flags.map((f: any) => html`<p class="flag">⚠ ${f.message}</p>`)}
${w.suggested_diff && !w.schedules.length ? html`<p>To switch this workflow to Cronkick, add <code>workflow_dispatch:</code> under <code>on:</code>, add these lines below it, and remove the <code>schedule:</code> block:</p><pre>${w.suggested_diff}</pre>` : ''}
</section>`) : html`<p class="muted">No workflows with an <code># cronkick:</code> marker or a native schedule yet.</p>`}`, c.get('session').login));
  });

  authed.post('/i/:id/email', async (c) => {
    const email = String((await c.req.parseBody()).email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.text('That email address looks wrong.', 400);
    await db.query('UPDATE installations SET alert_email = $2 WHERE id = $1', [Number(c.req.param('id')), email]);
    return c.redirect(`/i/${c.req.param('id')}`);
  });

  authed.get('/i/:id/w/:wid', async (c) => {
    const id = Number(c.req.param('id'));
    const wid = Number(c.req.param('wid'));
    const w = (await db.query(`SELECT w.name, r.full_name FROM workflows w JOIN repos r ON r.id = w.repo_id WHERE w.id = $1 AND r.installation_id = $2`, [wid, id])).rows[0];
    if (!w) return c.text('Not found', 404);
    const limits = PLANS[await planOf(db, id)];
    const now = deps.now();
    // History = slots that are due; future pending ones aren't history yet.
    // Free: last N slots. Pro: N days, counted in SQL; the table shows at most 500 rows.
    const window = limits.historyRows
      ? `id IN (SELECT id FROM slots WHERE workflow_id = $1 AND due_at <= $2 ORDER BY due_at DESC LIMIT ${limits.historyRows})`
      : `workflow_id = $1 AND due_at <= $2 AND due_at > $2::timestamptz - interval '${limits.historyDays} days'`;
    const { rows } = await db.query(`SELECT * FROM slots WHERE ${window} ORDER BY due_at DESC LIMIT ${MAX_ROWS}`, [wid, now]);
    const counts: Record<string, number> = Object.fromEntries(
      (await db.query(`SELECT state, count(*)::int AS n FROM slots WHERE ${window} GROUP BY state`, [wid, now])).rows.map((r) => [r.state, r.n]),
    );
    const next = (await db.query(`SELECT due_at FROM slots WHERE workflow_id = $1 AND due_at > $2 AND state = 'pending' ORDER BY due_at LIMIT 1`, [wid, now])).rows[0];
    return c.html(page(`${w.name} · Cronkick`, html`
<p><a href="/i/${id}">← ${w.full_name}</a></p><h1>${w.name}</h1>
${stateCounts(counts)}
<p class="muted">${limits.historyRows ? `Last ${limits.historyRows} slots (Free).` : `Last ${limits.historyDays} days${rows.length === MAX_ROWS ? `, newest ${MAX_ROWS} shown` : ''}.`} Next slot: ${next ? next.due_at.toISOString() : 'none scheduled'}.
<strong>unknown</strong> means we sent the trigger but couldn't confirm GitHub got it, so we didn't retry. <strong>expired</strong> means GitHub kept failing until the deadline, so we skipped it rather than run it late.</p>
${slotTable(rows)}`, c.get('session').login));
  });

  app.route('/', authed);
  return app;
}
