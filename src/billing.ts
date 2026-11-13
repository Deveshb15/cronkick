import { createHmac, timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/node';
import { tx } from './db.ts';
import type { Deps } from './deps.ts';
import { paidPlanFor, type PlanName } from './plans.ts';
import { identifyInstallation, track } from './posthog.ts';
import { afterChange, syncInstallation } from './sync.ts';

type Paid = Exclude<PlanName, 'free'>;
/** Dodo product id -> the plan it buys. Test and live mode have different ids, so they come from env. */
export type Products = Record<string, Paid>;
export type BillingConfig = { secret: string; products: Products };
type Headers = Record<string, string | undefined>;

export function dodoProducts(env = process.env): Products {
  const out: Products = {};
  for (const [name, plan] of [['PRO_MONTHLY', 'pro'], ['PRO_YEARLY', 'pro'], ['TEAM_MONTHLY', 'team'], ['TEAM_YEARLY', 'team']] as const) {
    const id = env[`DODO_PRODUCT_${name}`];
    if (id) out[id] = plan;
  }
  return out;
}

/**
 * Standard Webhooks check (what Dodo signs with): HMAC-SHA256 over "id.timestamp.body" with the base64 key after
 * "whsec_", any of the space-separated "v1,<sig>" values matching, and a timestamp within 5 minutes (no replays).
 */
export function verifyDodoSignature(secret: string, h: Headers, body: string, now: Date): boolean {
  const id = h['webhook-id'], ts = h['webhook-timestamp'], sigs = h['webhook-signature'];
  if (!secret || !id || !ts || !sigs || !/^\d+$/.test(ts)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(ts)) > 5 * 60) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(' ').some((s) => {
    const [v, sig] = s.split(',');
    const got = Buffer.from(sig ?? '', 'base64');
    return v === 'v1' && got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/**
 * The plan a subscription in this state buys. null: leave the plan alone (pending, or a state we don't act on).
 * A cancelled subscription keeps its plan until paid_through; `downgradeLapsed` ends it after that.
 */
function planFor(status: string, paid: Paid, paidThrough: Date | null, now: Date): PlanName | null {
  if (status === 'active' || status === 'past_due') return paid; // past_due: Dodo's grace period, access continues
  if (status === 'cancelled') return paidThrough && paidThrough > now ? paid : 'free';
  if (['on_hold', 'expired', 'failed', 'paused'].includes(status)) return 'free';
  return null;
}

/** POST /webhooks/dodo. Returns the status to answer; 5xx makes Dodo retry. */
export async function handleDodoWebhook(deps: Deps, cfg: BillingConfig, h: Headers, body: string): Promise<{ status: number; text: string }> {
  if (!cfg.secret) return { status: 503, text: 'billing not configured' };
  const now = deps.now();
  if (!verifyDodoSignature(cfg.secret, h, body, now)) return { status: 401, text: 'bad signature' };
  const event = JSON.parse(body);
  const sub = event.data ?? {};
  if (!String(event.type).startsWith('subscription.') || !sub.subscription_id) {
    await deps.db.query('INSERT INTO billing_events (webhook_id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING', [h['webhook-id'], event.type]);
    return { status: 200, text: 'ignored' };
  }

  const paid = cfg.products[sub.product_id];
  const at = new Date(event.timestamp ?? now);
  const paidThrough = sub.next_billing_date ? new Date(sub.next_billing_date) : null;
  const changed = await tx(deps.db, async (c) => {
    const fresh = await c.query('INSERT INTO billing_events (webhook_id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING', [h['webhook-id'], event.type]);
    if (!fresh.rowCount) return null; // a retried delivery
    // Checkout puts our installation id on the subscription; fall back to the stored subscription id.
    const { rows: [inst] } = await c.query(
      `SELECT id, plan, account_type, dodo_subscription_id, billing_updated_at FROM installations
        WHERE id = $1 OR dodo_subscription_id = $2 ORDER BY (id = $1) DESC LIMIT 1 FOR UPDATE`,
      [Number(sub.metadata?.installation_id) || 0, sub.subscription_id],
    );
    const problem =
      !inst ? 'no installation for this subscription'
      : !paid ? `unknown product ${sub.product_id}`
      : paid !== paidPlanFor(inst.account_type) ? `${paid} product on a ${inst.account_type} account`
      : null;
    if (problem) {
      Sentry.captureMessage(`dodo webhook ignored: ${problem}`, { extra: { type: event.type, subscription: sub.subscription_id } });
      return null;
    }
    // An event for a subscription the account has since replaced (unless it is the one now active), or one older
    // than the last applied, must not undo newer state.
    if (inst.dodo_subscription_id && inst.dodo_subscription_id !== sub.subscription_id && sub.status !== 'active') return null;
    if (inst.billing_updated_at && inst.billing_updated_at > at) return null;
    const plan = planFor(sub.status, paid, paidThrough, now) ?? inst.plan;
    await c.query(
      `UPDATE installations SET plan = $2, dodo_customer_id = $3, dodo_subscription_id = $4, subscription_status = $5,
              paid_through = $6, billing_updated_at = $7 WHERE id = $1`,
      [inst.id, plan, sub.customer?.customer_id ?? null, sub.subscription_id, sub.status, paidThrough, at],
    );
    track('subscription_updated', inst.id, { type: event.type, status: sub.status ?? null, plan_before: inst.plan, plan_after: plan, plan_changed: plan !== inst.plan, product: paid });
    identifyInstallation(inst.id, { plan, subscription_status: sub.status ?? null });
    return plan !== inst.plan ? inst.id as number : null;
  });
  if (changed) await resync(deps, changed);
  return { status: 200, text: 'ok' };
}

/**
 * The plan sets the fastest allowed interval, so workflow files are checked again. If GitHub fails, still apply the
 * schedule limit from what is stored (the daily reconcile re-reads the files), rather than fail a webhook that is
 * already recorded and would not be applied again.
 */
async function resync(deps: Deps, installationId: number): Promise<void> {
  try {
    await syncInstallation(deps, installationId);
  } catch (e) {
    Sentry.captureException(e, { tags: { billing: 'resync' } });
    await afterChange(deps, installationId);
  }
}

/** Cancelled subscriptions whose paid period has ended go to Free. Runs with maintenance; one server wins each row. */
export async function downgradeLapsed(deps: Deps, now: Date): Promise<void> {
  const { rows } = await deps.db.query(
    `UPDATE installations SET plan = 'free'
      WHERE plan <> 'free' AND subscription_status = 'cancelled' AND paid_through <= $1 RETURNING id`,
    [now],
  );
  for (const r of rows) {
    track('plan_lapsed_to_free', r.id);
    identifyInstallation(r.id, { plan: 'free' });
    await resync(deps, r.id);
  }
}
