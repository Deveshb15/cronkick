'use server';
import { revalidatePath } from 'next/cache';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { setDismissed } from '@/lib/data';

/** "Keep it on GitHub" (hide) or "Show again". Server actions are public endpoints, so access is checked here. */
export async function keepOnGitHub(installationId: number, workflowId: number, hidden: boolean) {
  await requireInstallation(installationId, `/dashboard/${installationId}`);
  await setDismissed(db, installationId, workflowId, hidden);
  revalidatePath(`/dashboard/${installationId}`);
}
