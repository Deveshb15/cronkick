import type { Deps } from './deps.js';

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
  try {
    await deps.mailer.send({
      to,
      subject: `Ontime: ${paused} schedule${paused === 1 ? '' : 's'} paused by your plan limit`,
      text: `Your ${rows[0].plan} plan's limit was reached, so ${paused} schedule(s) are paused and won't be triggered. Nothing was charged.\n\nSee which ones: ${deps.baseUrl}/i/${installationId}`,
    });
  } catch (e) {
    await deps.db.query('UPDATE installations SET limit_email_sent_at = NULL WHERE id = $1', [installationId]);
    throw e;
  }
}

type AlertRow = { id: number; installation_id: number; state: string; conclusion: string | null; due_at: Date; run_url: string | null; full_name: string; name: string; workflow_id: number; response_note: string | null };

/**
 * Email Pro accounts about unknown/expired slots and failed runs (R13). Deduped by slot + kind,
 * and a failed send isn't recorded, so the next pass retries it.
 */
export async function sendSlotAlerts(deps: Deps): Promise<number> {
  const { rows } = await deps.db.query<AlertRow & { kind: string }>(
    `SELECT s.id, s.installation_id, s.state, s.conclusion, s.due_at, s.run_url, s.workflow_id, s.response_note, r.full_name, w.name,
            CASE WHEN s.state IN ('unknown', 'expired') THEN s.state ELSE 'run_failed' END AS kind
       FROM slots s JOIN installations i ON i.id = s.installation_id
       JOIN repos r ON r.id = s.repo_id JOIN workflows w ON w.id = s.workflow_id
      WHERE i.plan = 'pro' AND NOT i.removed AND i.alert_email IS NOT NULL
        AND s.updated_at > $1::timestamptz - interval '1 day'
        AND (s.state IN ('unknown', 'expired') OR s.conclusion IN ('failure', 'timed_out', 'startup_failure'))
        AND NOT EXISTS (SELECT 1 FROM alerts_sent a WHERE a.key =
              (CASE WHEN s.state IN ('unknown', 'expired') THEN s.state ELSE 'run_failed' END) || ':' || s.id)
      LIMIT 100`,
    [deps.now()],
  );
  let sent = 0;
  for (const r of rows) {
    const to = await recipient(deps, r.installation_id);
    if (!to) continue;
    const what = {
      unknown: `We sent the trigger, but couldn't confirm that GitHub received it. We did not retry, to avoid a double run.${r.response_note ? `\nDetails: ${r.response_note}` : ''}`,
      expired: `We couldn't trigger it within its deadline (GitHub kept failing or throttling), so we skipped it rather than run it late.`,
      run_failed: `The run we triggered finished with "${r.conclusion}".${r.run_url ? `\nRun: ${r.run_url}` : ''}`,
    }[r.kind];
    const key = `${r.kind}:${r.id}`;
    // Claim first, so two servers never both send it; release the claim if the send fails.
    const claimed = await deps.db.query('INSERT INTO alerts_sent (key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key', [key]);
    if (!claimed.rowCount) continue;
    try {
      await deps.mailer.send({
        to,
        subject: `Ontime: ${r.full_name} · ${r.name} — ${r.kind.replace('_', ' ')} (${r.due_at.toISOString()})`,
        text: `${what}\n\nSlot due ${r.due_at.toISOString()}.\nHistory: ${deps.baseUrl}/i/${r.installation_id}/w/${r.workflow_id}`,
      });
      sent++;
    } catch (e) {
      await deps.db.query('DELETE FROM alerts_sent WHERE key = $1', [key]);
      console.error('alert send failed; will retry', e);
    }
  }
  return sent;
}
