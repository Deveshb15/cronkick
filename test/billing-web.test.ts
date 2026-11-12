import { afterEach, expect, test, vi } from 'vitest';
import { checkoutUrl, productFor } from '../web/lib/billing.ts';
import { canBuy, type Billing } from '../web/lib/data.ts';

const env = { DODO_PRODUCT_PRO_MONTHLY: 'pdt_pm', DODO_PRODUCT_PRO_YEARLY: 'pdt_py', DODO_PRODUCT_TEAM_MONTHLY: 'pdt_tm', DODO_PRODUCT_TEAM_YEARLY: 'pdt_ty' };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('the product comes from the account type: organizations buy Team, people buy Pro', () => {
  expect(productFor('Organization', 'yearly', env)).toBe('pdt_ty');
  expect(productFor('User', 'monthly', env)).toBe('pdt_pm');
  expect(productFor('User', 'monthly', {})).toBeNull();
});

test('who may start a checkout', () => {
  const b = (plan: Billing['plan'], status: string | null): Billing => ({ plan, status, account_type: 'User', customer: null, paidThrough: null });
  expect(canBuy(b('free', null))).toBe(true);
  expect(canBuy(b('free', 'expired'))).toBe(true);
  expect(canBuy(b('free', 'cancelled'))).toBe(true); // cancelled and lapsed: may buy again
  expect(canBuy(b('pro', null))).toBe(false); // comped
  expect(canBuy(b('pro', 'active'))).toBe(false);
  expect(canBuy(b('free', 'on_hold'))).toBe(false); // fix the card in the portal instead of a second subscription
});

test('checkout session: right product, installation id in metadata, back to Settings', async () => {
  for (const [k, v] of Object.entries({ ...env, BASE_URL: 'https://cronkick.xyz', DODO_PAYMENTS_API_KEY: 'k' })) vi.stubEnv(k, v);
  const fetch = vi.fn(async () => new Response(JSON.stringify({ session_id: 's', checkout_url: 'https://checkout.dodopayments.com/s' })));
  vi.stubGlobal('fetch', fetch);
  const url = await checkoutUrl({ id: 7, account_login: 'acme', account_type: 'Organization' }, 'monthly');
  expect(url).toBe('https://checkout.dodopayments.com/s');
  const [called, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(called).toBe('https://test.dodopayments.com/checkouts');
  expect(JSON.parse(init.body as string)).toMatchObject({
    product_cart: [{ product_id: 'pdt_tm', quantity: 1 }],
    metadata: { installation_id: '7' },
    return_url: 'https://cronkick.xyz/dashboard/7/settings?checkout=done',
  });
});

test('a Dodo error surfaces instead of sending the customer nowhere', async () => {
  for (const [k, v] of Object.entries({ ...env, BASE_URL: 'https://cronkick.xyz' })) vi.stubEnv(k, v);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
  await expect(checkoutUrl({ id: 7, account_login: 'me', account_type: 'User' }, 'yearly')).rejects.toThrow(/401/);
});
