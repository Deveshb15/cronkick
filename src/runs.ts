import type { Db } from './db.ts';


type Run = { id: number; workflow_id: number; event: string; html_url: string; status: string; conclusion: string | null; created_at: string };

/**
 * Link a `workflow_run` webhook to the slot that caused it (R12).
 * First by run id (newer dispatch responses return it); otherwise the oldest fired slot on that
 * workflow without a run, fired in the last 10 minutes. A manual dispatch in that window can be
 * matched by mistake, so those links are marked matched_by = 'time'.
 */
export async function linkRun(db: Db, run: Run): Promise<number | null> {
  if (run.event !== 'workflow_dispatch') return null;
  const conclusion = run.status === 'completed' ? run.conclusion : null;
  const byId = await db.query(
    `UPDATE slots SET conclusion = coalesce($2, conclusion), run_url = coalesce(run_url, $3), updated_at = now() WHERE run_id = $1 RETURNING id`,
    [run.id, conclusion, run.html_url],
  );
  if (byId.rowCount) return byId.rows[0].id;

  const created = new Date(run.created_at);
  const byTime = await db.query(
    `UPDATE slots SET state = 'accepted', run_id = $1, run_url = $2, matched_by = 'time', conclusion = $3, updated_at = now()
      WHERE id = (SELECT id FROM slots WHERE workflow_id = $4 AND state = 'fired' AND run_id IS NULL
                    AND fired_at BETWEEN $5::timestamptz - interval '10 minutes' AND $5::timestamptz + interval '1 minute'
                  ORDER BY fired_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id`,
    [run.id, run.html_url, conclusion, run.workflow_id, created],
  );
  return byTime.rows[0]?.id ?? null;
}
