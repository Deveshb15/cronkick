import { paidPlanFor } from '../../src/plans.ts';

export type Interval = 'monthly' | 'yearly';

// Two calls to Dodo's REST API (https://docs.dodopayments.com/api-reference), so no SDK.
const api = () => (process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com');

/** The Dodo product an account buys: the tier is fixed by the account type, never by the form (R4). */
export function productFor(accountType: string, interval: Interval, env = process.env): string | null {
  return env[`DODO_PRODUCT_${paidPlanFor(accountType).toUpperCase()}_${interval.toUpperCase()}`] || null;
}

export const billingEnabled = () => !!process.env.DODO_PAYMENTS_API_KEY;

async function dodo<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${api()}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Dodo ${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

/** A hosted checkout for this installation's plan. The installation id rides on the subscription for the webhook. */
export async function checkoutUrl(inst: { id: number; account_login: string; account_type: string }, interval: Interval): Promise<string> {
  const product = productFor(inst.account_type, interval);
  if (!product) throw new Error(`No Dodo product configured for ${inst.account_type} ${interval}`);
  const settings = `${process.env.BASE_URL}/dashboard/${inst.id}/settings`;
  const r = await dodo<{ checkout_url?: string }>('/checkouts', {
    product_cart: [{ product_id: product, quantity: 1 }],
    metadata: { installation_id: String(inst.id), github_account: inst.account_login },
    return_url: `${settings}?checkout=done`,
    cancel_url: settings,
    customization: { theme: 'dark' },
  });
  if (!r.checkout_url) throw new Error('Dodo returned no checkout URL');
  return r.checkout_url;
}

/** Dodo's customer portal: change card, see invoices, cancel. */
export async function portalUrl(customerId: string, installationId: number): Promise<string> {
  const back = encodeURIComponent(`${process.env.BASE_URL}/dashboard/${installationId}/settings`);
  const r = await dodo<{ link: string }>(`/customers/${encodeURIComponent(customerId)}/customer-portal/session?return_url=${back}`);
  return r.link;
}
