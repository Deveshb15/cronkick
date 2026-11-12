'use server';
import { redirect } from 'next/navigation';
import { requireInstallation } from '@/lib/access';
import { checkoutUrl, portalUrl, type Interval } from '@/lib/billing';
import { db } from '@/lib/db';
import { billingOf, canBuy, installationsFor, setAlertEmail } from '@/lib/data';

export type SaveState = { ok: boolean; error: string | null; email: string };

/** Save the alert email. Server actions are public endpoints, so access is checked again here. */
export async function saveAlertEmail(id: number, _prev: SaveState, form: FormData): Promise<SaveState> {
  await requireInstallation(id, `/dashboard/${id}/settings`);
  const email = String(form.get('email') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'That doesn’t look like an email address.', email };
  await setAlertEmail(db, id, email);
  return { ok: true, error: null, email };
}

/** Upgrade: to Dodo's hosted checkout for the one plan this account can buy. The tier comes from the account, not the form. */
export async function startCheckout(id: number, interval: Interval): Promise<void> {
  await requireInstallation(id, `/dashboard/${id}/settings`);
  const [inst] = await installationsFor(db, [id]);
  if (!inst || !canBuy(await billingOf(db, id))) redirect(`/dashboard/${id}/settings`);
  redirect(await checkoutUrl(inst, interval === 'yearly' ? 'yearly' : 'monthly'));
}

/** Manage billing: Dodo's customer portal (card, invoices, cancel). */
export async function openBillingPortal(id: number): Promise<void> {
  await requireInstallation(id, `/dashboard/${id}/settings`);
  const { customer } = await billingOf(db, id);
  if (!customer) redirect(`/dashboard/${id}/settings`);
  redirect(await portalUrl(customer, id));
}
