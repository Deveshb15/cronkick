import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { ProbeReport } from '../probe/collector.js';

type H = HtmlEscapedString | Promise<HtmlEscapedString>;

const css = `
:root{--bg:#fff;--fg:#1b1f24;--muted:#59636e;--line:#d1d9e0;--ok:#1a7f37;--warn:#9a6700;--bad:#cf222e;--code:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--code:#151b23}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px}a{color:inherit}h1{font-size:22px}h2{font-size:17px;margin-top:28px}
table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow-x:auto}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
pre,code{background:var(--code);border-radius:6px}pre{padding:10px;overflow-x:auto}code{padding:1px 4px}
.muted{color:var(--muted)}.pill{display:inline-block;padding:0 8px;border-radius:99px;border:1px solid var(--line);font-size:12px}
.fired,.accepted{color:var(--ok)}.unknown,.expired{color:var(--bad)}.skipped,.pending,.dispatching{color:var(--muted)}.flag{color:var(--warn)}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding:10px 16px}
input{padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}button{padding:6px 12px;border-radius:6px;border:1px solid var(--line);background:var(--code);color:var(--fg);cursor:pointer}`;

export function page(title: string, body: H, login?: string): H {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${raw(css)}</style></head><body>
<header><a href="/"><strong>Ontime</strong></a><span>${login ? html`${login} · <a href="/logout">Sign out</a>` : html`<a href="/login">Sign in with GitHub</a>`}</span></header>
<main>${body}</main></body></html>`;
}

export const STATES = ['accepted', 'fired', 'unknown', 'expired', 'skipped', 'pending', 'dispatching'] as const;

export function stateCounts(counts: Record<string, number>): H {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return html`<p>${total} slots: ${STATES.filter((s) => counts[s]).map((s) => html`<span class="pill ${s}">${s} ${counts[s]}</span> `)}</p>`;
}

const iso = (d: Date | null) => (d ? d.toISOString().replace('T', ' ').slice(0, 19) : '—');
const secs = (a: Date | null, b: Date) => (a ? `+${((a.getTime() - b.getTime()) / 1000).toFixed(1)} s` : '—');

export function slotTable(rows: any[]): H {
  if (!rows.length) return html`<p class="muted">No slots yet.</p>`;
  return html`<table><thead><tr><th>Due (UTC)</th><th>First attempt</th><th>State</th><th>GitHub said</th><th>Run</th><th>Conclusion</th></tr></thead><tbody>
${rows.map((r) => html`<tr><td>${iso(r.due_at)}</td><td>${secs(r.first_attempt_at, r.due_at)}</td><td class="${r.state}">${r.state}</td>
<td title="${r.response_note ?? ''}">${r.response_status ?? ''} ${r.response_note ? r.response_note.slice(0, 60) : ''}</td>
<td>${r.run_url ? html`<a href="${r.run_url}">run</a>${r.matched_by === 'time' ? html` <span class="muted" title="Matched by time; a manual dispatch in the same minutes could be mixed up">(matched by time)</span>` : ''}` : ''}</td>
<td>${r.conclusion ?? ''}</td></tr>`)}
</tbody></table>`;
}

const fmt = (s: number | null) => (s === null ? '—' : s < 120 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

export function latenessPage(reports: ProbeReport[], login?: string): H {
  const any = reports.some((r) => r.stats.expected > 0);
  return page('GitHub cron lateness', html`
<h1>How late are GitHub Actions scheduled workflows?</h1>
<p class="muted">Measured from our own probe repos using only GitHub's native <code>schedule:</code> trigger. Lateness is the time from the
scheduled minute until GitHub created the run. Last 7 days. A slot with no run after an hour counts as missing.</p>
${any ? html`<table><thead><tr><th>Schedule</th><th>Repos</th><th>Expected slots</th><th>Ran</th><th>Never ran</th><th>p50 late</th><th>p95 late</th></tr></thead><tbody>
${reports.map((r) => html`<tr><td><code>${r.cron}</code></td><td>${r.repos}</td><td>${r.stats.expected}</td><td>${r.stats.ran}</td>
<td>${(r.stats.missingShare * 100).toFixed(1)}%</td><td>${fmt(r.stats.p50Sec)}</td><td>${fmt(r.stats.p95Sec)}</td></tr>`)}
</tbody></table>` : html`<p><strong>Collecting data.</strong> The first numbers appear an hour after the probes start.</p>`}
<p>Ontime triggers your workflows through <code>workflow_dispatch</code> on our clock instead. <a href="/">How it works</a>.</p>`, login);
}
