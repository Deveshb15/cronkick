import type { Deps } from './deps.ts';
import type { Mail } from './mailer.ts';
import { PLANS, type PlanName } from './plans.ts';
import { emitPostHogWorkerLog, track } from './posthog.ts';

async function recipient(deps: Deps, installationId: number): Promise<string | null> {
  const { rows } = await deps.db.query('SELECT alert_email FROM installations WHERE id = $1', [installationId]);
  return rows[0]?.alert_email ?? null;
}

/**
 * One email when a plan limit pauses schedules; reset once nothing is paused (R15).
 * The send is claimed in the database first, so with several servers only one sends it.
 */
export async function sendLimitNotice(deps: Deps, installationId: number, paused: number): Promise<void> {
  if (paused === 0) {
    await deps.db.query('UPDATE installations SET limit_email_sent_at = NULL WHERE id = $1', [installationId]);
    return;
  }
  const to = await recipient(deps, installationId);
  if (!to) return;
  const { rows } = await deps.db.query(
    'UPDATE installations SET limit_email_sent_at = $2 WHERE id = $1 AND limit_email_sent_at IS NULL RETURNING plan',
    [installationId, deps.now()],
  );
  if (!rows[0]) return; // already sent, or another server is sending it
  // ponytail: fires only when an alert email is set (it rides on the one-send claim); move it if the funnel needs every account.
  track('plan_limit_reached', installationId, { paused, plan: rows[0].plan });
  try {
    await deps.mailer.send({
      to,
      subject: `Cronkick: ${paused} schedule${paused === 1 ? '' : 's'} paused by your plan limit`,
      text: `Your ${rows[0].plan} plan's limit was reached, so ${paused} schedule(s) are paused and won't be triggered. Nothing was charged.\n\nSee which ones: ${deps.baseUrl}/dashboard/${installationId}`,
    });
  } catch (e) {
    await deps.db.query('UPDATE installations SET limit_email_sent_at = NULL WHERE id = $1', [installationId]);
    throw e;
  }
}

/**
 * Catch up on limit emails a sync couldn't send, e.g. when the alert address is saved after schedules were paused (R20).
 * Counts paused schedules the same way `applyLimits` does. A failed send is logged and retried next pass.
 */
export async function sendLimitNotices(deps: Deps): Promise<void> {
  const { rows } = await deps.db.query<{ id: number; paused: number }>(
    `SELECT i.id, count(*)::int AS paused FROM installations i
       JOIN repos r ON r.installation_id = i.id JOIN workflows w ON w.repo_id = r.id JOIN schedules s ON s.workflow_id = w.id
      WHERE i.alert_email IS NOT NULL AND i.limit_email_sent_at IS NULL AND NOT i.removed AND NOT i.suspended
        AND r.active AND w.present AND w.flags = '[]' AND s.status = 'paused_limit'
      GROUP BY i.id LIMIT 100`,
  );
  for (const r of rows) await sendLimitNotice(deps, r.id, r.paused).catch((e) => console.error('limit notice failed; will retry', e));
}

type AlertRow = { id: number; installation_id: number; state: string; conclusion: string | null; due_at: Date; run_url: string | null; full_name: string; name: string; workflow_id: number; response_note: string | null; no_runner: boolean };

/**
 * Email Pro accounts about unknown/rejected/expired slots and failed runs (R13). Deduped by slot + kind,
 * and a failed send isn't recorded, so the next pass retries it. Runs Cronkick never tried (it was down or
 * behind) get a summary per account instead, at most one an hour, so an outage isn't a flood.
 */
export async function sendSlotAlerts(deps: Deps): Promise<number> {
  const { rows } = await deps.db.query<AlertRow & { kind: string }>(
    `SELECT s.id, s.installation_id, s.state, s.conclusion, s.due_at, s.run_url, s.workflow_id, s.response_note, r.full_name, w.name,
            CASE WHEN s.state IN ('unknown', 'rejected', 'expired') THEN s.state ELSE 'run_failed' END AS kind,
            EXISTS (SELECT 1 FROM rescue_runs x WHERE x.run_id = s.run_id AND x.verdict = 'github_broke' AND x.jobs @> '[{"class":"no_runner"}]') AS no_runner
       FROM slots s JOIN installations i ON i.id = s.installation_id
       JOIN repos r ON r.id = s.repo_id JOIN workflows w ON w.id = s.workflow_id
      WHERE i.plan <> 'free' AND NOT i.removed AND i.alert_email IS NOT NULL
        AND s.updated_at > $1::timestamptz - interval '1 day'
        AND (s.state IN ('unknown', 'rejected') OR (s.state = 'expired' AND s.attempts > 0) OR s.conclusion IN ('failure', 'timed_out', 'startup_failure'))
        AND NOT EXISTS (SELECT 1 FROM alerts_sent a WHERE a.key =
              (CASE WHEN s.state IN ('unknown', 'rejected', 'expired') THEN s.state ELSE 'run_failed' END) || ':' || s.id)
        -- Rescue classifies a failed run within seconds; wait for it (at most 10 min) so the one email says whose fault it was.
        AND NOT EXISTS (SELECT 1 FROM rescue_runs x WHERE x.run_id = s.run_id AND x.state = 'queued' AND x.created_at > $1::timestamptz - interval '10 minutes')
      LIMIT 100`,
    [deps.now()],
  );
  let sent = await sendUnsentSummaries(deps);
  for (const r of rows) {
    const to = await recipient(deps, r.installation_id);
    if (!to) continue;
    const what = {
      unknown: `We sent the trigger, but couldn't confirm that GitHub received it. We did not retry, to avoid a double run.${r.response_note ? `\nDetails: ${r.response_note}` : ''}`,
      rejected: `GitHub refused the trigger: ${r.response_note ?? 'no reason given'}. Check the workflow and the App's access; Cronkick won't retry.`,
      expired: `GitHub kept failing or throttling the trigger until its deadline, so Cronkick gave up rather than send it late.${r.response_note ? `\nLast response: ${r.response_note}` : ''}`,
      run_failed: `${r.no_runner ? 'GitHub never gave this run a runner (not your code).' : `The run we triggered finished with "${r.conclusion}".`}${r.run_url ? `\nRun: ${r.run_url}` : ''}`,
    }[r.kind];
    if (await sendOnce(deps, `${r.kind}:${r.id}`, {
      to,
      subject: `Cronkick: ${r.full_name} · ${r.name} — ${r.kind.replace('_', ' ')} (${r.due_at.toISOString()})`,
      text: `${what}\n\nSlot due ${r.due_at.toISOString()}.\nHistory: ${deps.baseUrl}/dashboard/${r.installation_id}/workflows/${r.workflow_id}`,
    })) sent++;
  }
  return sent;
}

/**
 * One email per account for never-tried expiries, at most one an hour. Each row's own `expired:<id>` key is claimed
 * in the same pass, so nothing is sent twice; on a failed send the keys are released and the next pass retries.
 * Rows that come in within the hour stay unclaimed, so the next summary includes them.
 */
async function sendUnsentSummaries(deps: Deps): Promise<number> {
  const { rows } = await deps.db.query<{ id: number; installation_id: number; alert_email: string; due_at: Date }>(
    `SELECT s.id, s.installation_id, i.alert_email, s.due_at FROM slots s JOIN installations i ON i.id = s.installation_id
      WHERE i.plan <> 'free' AND NOT i.removed AND i.alert_email IS NOT NULL
        AND s.updated_at > $1::timestamptz - interval '1 day' AND s.state = 'expired' AND s.attempts = 0
        AND NOT EXISTS (SELECT 1 FROM alerts_sent a WHERE a.key = 'expired:' || s.id)
      ORDER BY s.due_at LIMIT 5000`,
    [deps.now()],
  );
  const byInstall = new Map<number, typeof rows>();
  for (const r of rows) byInstall.set(r.installation_id, [...(byInstall.get(r.installation_id) ?? []), r]);
  let sent = 0;
  for (const [id, list] of byInstall) {
    // Take this account's hourly turn; with several servers only one gets it.
    const turn = await deps.db.query(
      `INSERT INTO alerts_sent (key, sent_at) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET sent_at = EXCLUDED.sent_at
        WHERE alerts_sent.sent_at <= $2::timestamptz - interval '1 hour' RETURNING key`, [`unsent:${id}`, deps.now()]);
    if (!turn.rowCount) continue;
    const claimed = new Set((await deps.db.query<{ key: string }>(
      'INSERT INTO alerts_sent (key) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING RETURNING key', [list.map((r) => `expired:${r.id}`)],
    )).rows.map((r) => r.key));
    const mine = list.filter((r) => claimed.has(`expired:${r.id}`)); // another server may have claimed some
    if (!mine.length) { await deps.db.query('DELETE FROM alerts_sent WHERE key = $1', [`unsent:${id}`]); continue; }
    const n = mine.length;
    const [from, to] = [mine[0].due_at.toISOString(), mine[n - 1].due_at.toISOString()];
    try {
      await deps.mailer.send({
        to: mine[0].alert_email,
        subject: `Cronkick: ${n} scheduled run${n === 1 ? '' : 's'} not sent`,
        text: `Cronkick didn't send ${n} scheduled run${n === 1 ? '' : 's'} due from ${from} to ${to} (UTC) before ${n === 1 ? 'its deadline' : 'their deadlines'}, so it gave up rather than send ${n === 1 ? 'it' : 'them'} late. This was on Cronkick's side, not GitHub's.\n\nDashboard: ${deps.baseUrl}/dashboard/${id}`,
      });
      sent++;
    } catch (e) {
      await deps.db.query('DELETE FROM alerts_sent WHERE key = ANY($1)', [[...claimed, `unsent:${id}`]]);
      console.error('alert send failed; will retry', e);
    }
  }
  return sent;
}

/** Claim the key first, so two servers never both send it; release the claim if the send fails, so the next pass retries. */
async function sendOnce(deps: Deps, key: string, mail: Mail): Promise<boolean> {
  const claimed = await deps.db.query('INSERT INTO alerts_sent (key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key', [key]);
  if (!claimed.rowCount) return false;
  try {
    await deps.mailer.send(mail);
    return true;
  } catch (e) {
    await deps.db.query('DELETE FROM alerts_sent WHERE key = $1', [key]);
    console.error('alert send failed; will retry', e);
    return false;
  }
}

/**
 * One email per coverage gap to each Pro account that has live schedules, so an outage is one message,
 * not one per missed time.
 */
export async function sendGapAlerts(deps: Deps): Promise<number> {
  const { rows } = await deps.db.query<{ gap_id: number; installation_id: number; alert_email: string; started_at: Date; ended_at: Date }>(
    `SELECT g.id AS gap_id, i.id AS installation_id, i.alert_email, g.started_at, g.ended_at
       FROM coverage_gaps g CROSS JOIN installations i
      WHERE g.detected_at > $1::timestamptz - interval '1 day'
        AND i.plan <> 'free' AND NOT i.removed AND NOT i.suspended AND i.alert_email IS NOT NULL AND i.created_at < g.ended_at
        AND EXISTS (SELECT 1 FROM schedules s JOIN workflows w ON w.id = s.workflow_id JOIN repos r ON r.id = w.repo_id
                     WHERE r.installation_id = i.id AND r.active AND w.present AND w.flags = '[]' AND s.status = 'active')
        AND NOT EXISTS (SELECT 1 FROM alerts_sent a WHERE a.key = 'gap:' || g.id || ':' || i.id)
      LIMIT 100`,
    [deps.now()],
  );
  let sent = 0;
  for (const r of rows) {
    const [from, to] = [r.started_at.toISOString(), r.ended_at.toISOString()];
    if (await sendOnce(deps, `gap:${r.gap_id}:${r.installation_id}`, {
      to: r.alert_email,
      subject: `Cronkick: scheduler down from ${from} to ${to} (UTC)`,
      text: `Cronkick's scheduler was down from ${from} to ${to} (UTC). Runs due then may not have been sent; any that were sent are listed in your dashboard's history.\n\nDashboard: ${deps.baseUrl}/dashboard/${r.installation_id}`,
    })) sent++;
  }
  return sent;
}

const DAY = 86_400_000;

/** Monday 00:00 UTC of the ISO week holding `d`, and its label ("2026-W46"). */
export function isoWeek(d: Date): { start: Date; label: string } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  const thursday = new Date(start.getTime() + 3 * DAY); // the ISO year is the one this week's Thursday falls in
  const year = thursday.getUTCFullYear();
  return { start, label: `${year}-W${Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY)) + 1}` };
}

type DigestRow = { installation_id: number; alert_email: string; plan: PlanName; verdict: string; jobs: { class: string }[] | null; slot_id: number | null; workflow_name: string; full_name: string };
const runs = (n: number) => `${n} run${n === 1 ? '' : 's'}`;

/**
 * Weekly, every plan: "GitHub broke N of your runs". Reports the ISO week that just ended, once per installation (the
 * alerts_sent key is claimed before sending, so two servers send it once), and only when something was GitHub's side.
 */
export async function sendRescueDigests(deps: Deps): Promise<number> {
  const now = deps.now();
  const thisWeek = isoWeek(now).start;
  // An hour into the new week, so last week's final runs are classified first.
  if (now.getTime() - thisWeek.getTime() < 60 * 60_000) return 0;
  const { start: from, label } = isoWeek(new Date(thisWeek.getTime() - DAY));
  // ponytail: re-reads last week's rows every pass for accounts with nothing to report; keep a "digest checked" marker if this gets slow.
  const { rows } = await deps.db.query<DigestRow>(
    `SELECT x.installation_id, i.alert_email, i.plan, x.verdict, x.jobs, x.slot_id, x.workflow_name, r.full_name
       FROM rescue_runs x JOIN installations i ON i.id = x.installation_id JOIN repos r ON r.id = x.repo_id
      WHERE i.alert_email IS NOT NULL AND NOT i.removed AND x.verdict IS NOT NULL AND x.completed_at >= $1 AND x.completed_at < $2
        AND NOT EXISTS (SELECT 1 FROM alerts_sent a WHERE a.key = 'digest:' || x.installation_id || ':' || $3)`,
    [from, thisWeek, label],
  );
  const byInstall = new Map<number, DigestRow[]>();
  for (const r of rows) byInstall.set(r.installation_id, [...(byInstall.get(r.installation_id) ?? []), r]);
  let sent = 0;
  for (const [id, list] of byInstall) {
    const n = (v: string) => list.filter((r) => r.verdict === v).length;
    const broke = list.filter((r) => r.verdict === 'github_broke');
    const noRunner = broke.filter((r) => r.jobs?.some((j) => j.class === 'no_runner')).length;
    const [notStarted, probably] = [n('not_started'), n('probably_github')];
    const counted = broke.length + notStarted + probably;
    if (!counted) continue;
    const affected = new Map<string, number>();
    for (const r of list) {
      if (r.slot_id === null || !['github_broke', 'not_started', 'probably_github'].includes(r.verdict)) continue;
      const k = `${r.full_name} · ${r.workflow_name}`;
      affected.set(k, (affected.get(k) ?? 0) + 1);
    }
    const stuck = (await deps.db.query(
      `SELECT count(*)::int AS n FROM slots WHERE installation_id = $1 AND state = 'accepted' AND fired_at >= $2 AND fired_at < $3
          AND fired_at < $4::timestamptz - interval '60 minutes' AND run_started_at IS NULL AND conclusion IS NULL`,
      [id, from, thisWeek, now],
    )).rows[0].n as number;
    const [billing, selfHosted] = [n('billing'), n('self_hosted')];
    const lines = [
      `Week of ${from.toISOString().slice(0, 10)} to ${new Date(thisWeek.getTime() - DAY).toISOString().slice(0, 10)} (UTC).`,
      '',
      ...(broke.length ? [`GitHub broke ${runs(broke.length)}:`,
        ...(noRunner ? [`- ${noRunner} never got a runner`] : []),
        ...(broke.length - noRunner ? [`- ${broke.length - noRunner} hit a GitHub service error while setting up (checkout, cache or artifacts)`] : [])] : []),
      ...(notStarted || probably ? [broke.length ? 'Also likely on GitHub’s side:' : 'Likely on GitHub’s side:',
        ...(notStarted ? [`- ${notStarted} didn't start, likely GitHub`] : []),
        ...(probably ? [`- ${probably} probably GitHub (the runner was lost, or GitHub gave up finding one)`] : [])] : []),
      '',
      affected.size ? `Cronkick schedules affected: ${[...affected].map(([k, c]) => `${k} (${c})`).join(', ')}.` : 'None of these were runs Cronkick started.',
      ...(stuck ? [`${runs(stuck)} Cronkick sent over an hour ago never started on GitHub (stuck in its queue).`] : []),
      ...(billing || selfHosted ? [`Not counted: ${runs(billing)} blocked by a GitHub billing lock, ${runs(selfHosted)} on self-hosted runners.`] : []),
      ...(PLANS[list[0].plan].rescue ? [] : ['On Pro and Team, Rescue can re-run runs like these once.']),
      '',
      `See each run: ${deps.baseUrl}/dashboard/${id}/rescue?utm_source=digest`,
    ];
    if (await sendOnce(deps, `digest:${id}:${label}`, {
      to: list[0].alert_email,
      subject: broke.length ? `GitHub broke ${broke.length} of your runs this week` : `${runs(counted)} probably failed on GitHub’s side this week`,
      text: lines.join('\n'),
    })) {
      sent++;
      emitPostHogWorkerLog('rescue digest sent', { n: counted });
    }
  }
  return sent;
}

/**
 * Paid accounts: one email per Rescue re-run (key rescue:<id>), once attempt 2 has finished, or after an hour with the
 * result still pending.
 */
export async function sendRescueRerunAlerts(deps: Deps): Promise<number> {
  const { rows } = await deps.db.query<{ id: number; installation_id: number; alert_email: string; full_name: string; workflow_name: string; completed_at: Date; rerun_at: Date; retry_conclusion: string | null; run_url: string }>(
    `SELECT x.id, x.installation_id, i.alert_email, r.full_name, x.workflow_name, x.completed_at, x.rerun_at, x.retry_conclusion, x.run_url
       FROM rescue_runs x JOIN installations i ON i.id = x.installation_id JOIN repos r ON r.id = x.repo_id
      WHERE i.plan <> 'free' AND NOT i.removed AND i.alert_email IS NOT NULL AND x.rerun_at > $1::timestamptz - interval '2 days'
        AND (x.state = 'done' OR (x.state IN ('rerun_requested', 'rerun_started') AND x.rerun_at <= $1::timestamptz - interval '1 hour'))
        AND NOT EXISTS (SELECT 1 FROM alerts_sent a WHERE a.key = 'rescue:' || x.id)
      LIMIT 100`,
    [deps.now()],
  );
  let sent = 0;
  for (const r of rows) {
    const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    if (await sendOnce(deps, `rescue:${r.id}`, {
      to: r.alert_email,
      subject: `Cronkick re-ran ${r.full_name} · ${r.workflow_name} after GitHub broke it`,
      text: `GitHub never gave ${r.full_name} · ${r.workflow_name} a runner at ${utc(r.completed_at)}. Cronkick re-ran the failed jobs once at ${utc(r.rerun_at)}. Result: ${r.retry_conclusion ?? 'pending'}.\n\nRun: ${r.run_url}\nRescue: ${deps.baseUrl}/dashboard/${r.installation_id}/rescue`,
    })) sent++;
  }
  return sent;
}
