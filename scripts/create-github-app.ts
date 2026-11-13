// Create the GitHub App from a manifest: one click in the browser, credentials land in .env.production.
// Usage: npx tsx scripts/create-github-app.ts [--org <org>] [--base https://cronkick.xyz]
// https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const base = arg('--base') ?? 'https://cronkick.xyz';
const org = arg('--org');
const PORT = 3456;
const OUT = '.env.production';
const state = randomBytes(16).toString('hex');

if (existsSync(OUT)) { console.error(`${OUT} already exists; move it away first so nothing is overwritten.`); process.exit(1); }

const manifest = {
  name: 'Cronkick',
  url: base,
  description: 'On-time cron for GitHub Actions. Triggers workflow_dispatch from # cronkick: comments in your workflow files.',
  hook_attributes: { url: `${base}/webhooks`, active: true },
  redirect_url: `http://localhost:${PORT}/done`,
  callback_urls: [`${base}/callback`],
  public: true,
  request_oauth_on_install: false,
  default_permissions: { actions: 'write', checks: 'read', contents: 'read', metadata: 'read' }, // checks: Rescue reads GitHub's error annotations
  default_events: ['push', 'workflow_run'],
};
const target = org ? `https://github.com/organizations/${org}/settings/apps/new` : 'https://github.com/settings/apps/new';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Create Cronkick App</title>
<body style="font:16px system-ui;max-width:640px;margin:40px auto">
<h1>Create the Cronkick GitHub App</h1><p>This sends the settings to GitHub. You review them there and click <b>Create GitHub App</b>.</p>
<form action="${target}?state=${state}" method="post"><input type="hidden" name="manifest" value="${esc(JSON.stringify(manifest))}">
<button style="font-size:16px;padding:8px 16px">Continue to GitHub</button></form></body>`);
    return;
  }
  if (url.pathname === '/done') {
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.get('state') !== state) { res.writeHead(400).end('State mismatch; run the script again.'); return; }
    const r = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, { method: 'POST', headers: { accept: 'application/vnd.github+json' } });
    if (!r.ok) { res.writeHead(500).end(`GitHub said ${r.status}: ${await r.text()}`); return; }
    const app: any = await r.json();
    const lines = [
      `GITHUB_APP_ID=${app.id}`,
      `GITHUB_APP_SLUG=${app.slug}`,
      `GITHUB_CLIENT_ID=${app.client_id}`,
      `GITHUB_CLIENT_SECRET=${app.client_secret}`,
      `GITHUB_WEBHOOK_SECRET=${app.webhook_secret}`,
      `GITHUB_PRIVATE_KEY=${String(app.pem).trim().replace(/\r?\n/g, '\\n')}`,
    ];
    writeFileSync(OUT, lines.join('\n') + '\n', { mode: 0o600 });
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<p style="font:16px system-ui">Done. <b>${esc(app.name)}</b> created: <a href="${esc(app.html_url)}">${esc(app.html_url)}</a>. You can close this tab.</p>`);
    console.log(`Created ${app.html_url} (id ${app.id}, slug ${app.slug}). Credentials written to ${OUT} (mode 600). Keep it out of git.`);
    server.close();
  }
});
server.listen(PORT, () => console.log(`Open http://localhost:${PORT} in your browser.`));
