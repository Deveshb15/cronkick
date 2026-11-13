'use server';
import { revalidatePath } from 'next/cache';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { setDismissed } from '@/lib/data';
import { captureServerEvent, distinctIdFor } from '@/lib/posthog-server';

/** "Keep it on GitHub" (hide) or "Show again". Server actions are public endpoints, so access is checked here. */
export async function keepOnGitHub(installationId: number, workflowId: number, hidden: boolean) {
  const session = await requireInstallation(installationId, `/dashboard/${installationId}`);
  await setDismissed(db, installationId, workflowId, hidden);
  await captureServerEvent(distinctIdFor(session), 'workflow_suggestion_visibility_changed', { hidden, workflow_id: workflowId }, installationId);
  revalidatePath(`/dashboard/${installationId}`);
}
