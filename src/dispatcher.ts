import type { Deps } from './deps.ts';
import { DispatchTimeout, type DispatchResult } from './github.ts';
import { track } from './posthog.ts';

const LEASE_MS = 60_000;
/** A call takes at most 10 s; don't start one with less lease than this left. */
const MIN_LEASE_LEFT_MS = 15_000;
const BATCH = 100;

type Claimed = { id: number; installation_id: number; workflow_id: number; attempts: number; fire_at: Date; deadline_at: Date; lease_until: Date; full_name: string; default_branch: string };

/**
 * Take due slots with a lease. SKIP LOCKED means two dispatchers never take the same row (R5).
 * Slots whose repo or installation is no longer live are never claimed.
 */
export async function claim(deps: Deps, limit = BATCH): Promise<Claimed[]> {
  const now = deps.now();
  const { rows } = await deps.db.query<Claimed>(
    `WITH c AS (
       UPDATE slots SET state = 'dispatching', lease_until = $2, attempts = attempts + 1,
              first_attempt_at = coalesce(first_attempt_at, $1), updated_at = $1
        WHERE id IN (
          SELECT s.id FROM slots s
            JOIN repos r ON r.id = s.repo_id JOIN installations i ON i.id = s.installation_id
           WHERE s.state = 'pending' AND s.fire_at <= $1 AND s.next_attempt_at <= $1 AND s.deadline_at > $1
             AND r.active AND NOT i.removed AND NOT i.suspended
           ORDER BY s.fire_at LIMIT $3
           FOR UPDATE OF s SKIP LOCKED)
       RETURNING id, installation_id, repo_id, workflow_id, attempts, fire_at, deadline_at, lease_until)
     SELECT c.*, r.full_name, r.default_branch FROM c JOIN repos r ON r.id = c.repo_id`,
    [now, new Date(now.getTime() + LEASE_MS), limit],
  );
  return rows;
}

const retryable = (r: DispatchResult) => r.status === 429 || r.status >= 500 || (r.status === 403 && r.retryAfterMs !== undefined);

/** Record what GitHub said. Retry only throttling/5xx, and only before the deadline (R7). Anything ambiguous is `unknown` (R8). */
export async function record(deps: Deps, slot: Claimed, result: DispatchResult | DispatchTimeout): Promise<void> {
  const now = deps.now();
  const db = deps.db;
  // Every update is guarded by state = 'dispatching', so a slot settle() already marked unknown is never overwritten.
  if (result instanceof DispatchTimeout) {
    // Clear the status: a 429 from an earlier try must not sit next to "Unconfirmed".
    await db.query(`UPDATE slots SET state = 'unknown', response_status = NULL, response_note = $2, lease_until = NULL, updated_at = $3 WHERE id = $1 AND state = 'dispatching'`, [slot.id, result.message, now]);
    return;
  }
  if (result.status >= 200 && result.status < 300) {
    await db.query(
      `UPDATE slots SET state = $2, fired_at = $3, response_status = $4, run_id = $5, run_url = $6, matched_by = $7, lease_until = NULL, updated_at = $3
        WHERE id = $1 AND state = 'dispatching'`,
      [slot.id, result.runId ? 'accepted' : 'fired', now, result.status, result.runId ?? null, result.runUrl ?? null, result.runId ? 'run_id' : null],
    );
    return;
  }
  if (retryable(result)) {
    const backoff = Math.max(result.retryAfterMs ?? 0, 2 ** slot.attempts * 1000);
    const next = new Date(now.getTime() + backoff);
    const state = next < slot.deadline_at ? 'pending' : 'expired';
    await db.query(
      `UPDATE slots SET state = $2, next_attempt_at = $3, response_status = $4, response_note = $5, lease_until = NULL, updated_at = $6 WHERE id = $1 AND state = 'dispatching'`,
      [slot.id, state, next, result.status, result.note ?? null, now],
    );
    return;
  }
  // 4xx (bad ref, workflow lacks workflow_dispatch, no permission): GitHub refused; don't retry.
  await db.query(
    `UPDATE slots SET state = 'rejected', response_status = $2, response_note = $3, lease_until = NULL, updated_at = $4 WHERE id = $1 AND state = 'dispatching'`,
    [slot.id, result.status, result.note ?? null, now],
  );
}

// One chain per installation: its calls go one at a time (GitHub rate limits, R10), while other
// installations, and the next ticks' claims, never wait for it.
const chains = new WeakMap<Deps, Map<number, Promise<void>>>();

async function fire(deps: Deps, s: Claimed): Promise<void> {
  // Queued too long behind slow calls: hand the slot back rather than call on an expiring lease,
  // which settle() would mark unknown while we're still calling.
  if (s.lease_until.getTime() - deps.now().getTime() < MIN_LEASE_LEFT_MS) {
    // Undoing the only attempt also undoes "first tried", so a later expiry doesn't show a try that never happened.
    await deps.db.query(
      `UPDATE slots SET state = 'pending', attempts = attempts - 1, first_attempt_at = CASE WHEN attempts = 1 THEN NULL ELSE first_attempt_at END, lease_until = NULL
        WHERE id = $1 AND state = 'dispatching'`,
      [s.id],
    );
    return;
  }
  let result: DispatchResult | DispatchTimeout;
  try {
    result = await deps.gh.dispatch(s.installation_id, s.full_name, s.workflow_id, s.default_branch);
  } catch (e) {
    result = e instanceof DispatchTimeout ? e : new DispatchTimeout(`Unexpected error: ${(e as Error).message}`);
  }
  await record(deps, s, result);
  const outcome = result instanceof DispatchTimeout ? 'unknown' : result.status < 300 ? 'accepted' : retryable(result) ? 'retry' : 'rejected';
  track('kick_dispatched', s.installation_id, {
    outcome, attempt: s.attempts, workflow_id: s.workflow_id, repo: s.full_name,
    status: result instanceof DispatchTimeout ? null : result.status,
    delay_ms: deps.now().getTime() - new Date(s.fire_at).getTime(),
  });
}

/** One tick: claim due slots and queue them. Returns without waiting for the calls; see drain(). */
export async function dispatchTick(deps: Deps): Promise<number> {
  const slots = await claim(deps);
  let byInstall = chains.get(deps);
  if (!byInstall) chains.set(deps, (byInstall = new Map()));
  for (const s of slots) {
    const prev = byInstall.get(s.installation_id) ?? Promise.resolve();
    const next = prev.then(() => fire(deps, s)).catch((e) => console.error(`dispatch of slot ${s.id} failed`, e));
    byInstall.set(s.installation_id, next);
    void next.then(() => { if (byInstall.get(s.installation_id) === next) byInstall.delete(s.installation_id); });
  }
  return slots.length;
}

/** Wait for every queued call to finish (shutdown, tests). */
export async function drain(deps: Deps): Promise<void> {
  while (chains.get(deps)?.size) await Promise.all(chains.get(deps)!.values());
}
