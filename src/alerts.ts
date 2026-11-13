import type { Deps } from './deps.ts';
import type { Mail } from './mailer.ts';
import { track } from './posthog.ts';

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

type AlertRow = { id: number; installation_id: number; state: string; conclusion: string | null; due_at: Date; run_url: string | null; full_name: string; name: string; workflow_id: number; response_note: string | null };

/**
 * Email Pro accounts about unknown/rejected/expired slots and failed runs (R13). Deduped by slot + kind,
 * and a failed send isn't recorded, so the next pass retries it. Runs Cronkick never tried (it was down or
 * behind) get a summary per account instead, at most one an hour, so an outage isn't a flood.
 */
export async function sendSlotAlerts(deps: Deps): Promise<number> {
  const { rows } = await deps.db.query<AlertRow & { kind: string }>(
    `SELECT s.id, s.installation_id, s.state, s.conclusion, s.due_at, s.run_url, s.workflow_id, s.response_note, r.full_name, w.name,
            CASE WHEN s.state IN ('unknown', 'rejected', 'expired') THEN s.state ELSE 'run_failed' END AS kind
       FROM slots s JOIN installations i ON i.id = s.installation_id
       JOIN repos r ON r.id = s.repo_id JOIN workflows w ON w.id = s.workflow_id
      WHERE i.plan <> 'free' AND NOT i.removed AND i.alert_email IS NOT NULL
        AND s.updated_at > $1::timestamptz - interval '1 day'
        AND (s.state IN ('unknown', 'rejected') OR (s.state = 'expired' AND s.attempts > 0) OR s.conclusion IN ('failure', 'timed_out', 'startup_failure'))
        AND NOT EXISTS (SELECT 1 FROM alerts_sent a WHERE a.key =
              (CASE WHEN s.state IN ('unknown', 'rejected', 'expired') THEN s.state ELSE 'run_failed' END) || ':' || s.id)
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
      run_failed: `The run we triggered finished with "${r.conclusion}".${r.run_url ? `\nRun: ${r.run_url}` : ''}`,
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
