'use server';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { setAlertEmail } from '@/lib/data';

export type SaveState = { ok: boolean; error: string | null; email: string };

/** Save the alert email. Server actions are public endpoints, so access is checked again here. */
export async function saveAlertEmail(id: number, _prev: SaveState, form: FormData): Promise<SaveState> {
  await requireInstallation(id, `/dashboard/${id}/settings`);
  const email = String(form.get('email') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'That doesn’t look like an email address.', email };
  await setAlertEmail(db, id, email);
  return { ok: true, error: null, email };
}
