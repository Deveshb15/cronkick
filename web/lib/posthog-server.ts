import { headers } from 'next/headers';
import { after } from 'next/server';
import { PostHog } from 'posthog-node';
import { emitPostHogWebLog, flushPostHogWebLogs } from '@/instrumentation';
import { POSTHOG_HOST, POSTHOG_TOKEN } from '../../src/posthog-config.ts';
import type { Session } from './session';

let client: PostHog | undefined;

/** The PostHog person for a signed-in GitHub user; the browser identifies with the same id. */
export const distinctIdFor = (s: Pick<Session, 'userId'>) => (s.userId ? `github:${s.userId}` : undefined);

/** Capture a trusted server-side outcome without allowing analytics delivery to block the action. */
export async function captureServerEvent(distinctId: string | undefined, event: string, properties: Record<string, boolean | number | string> = {}, installationId?: number) {
  // Sessions from before the user id was stored have no id; they expire within the hour.
  if (!distinctId) return;
  client ??= new PostHog(POSTHOG_TOKEN, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0, requestTimeout: 2000, fetchRetryCount: 0 });
  try {
    const sessionId = (await headers()).get('X-POSTHOG-SESSION-ID');
    client.capture({
      distinctId,
      event,
      properties: { ...properties, ...(installationId ? { installation_id: installationId } : {}), ...(sessionId ? { $session_id: sessionId } : {}) },
      ...(installationId ? { groups: { installation: String(installationId) } } : {}),
    });
    emitPostHogWebLog('server analytics outcome captured', { analytics_event: event, has_browser_session: Boolean(sessionId) });
    after(() => flushPostHogWebLogs());
    await client.flush().catch(() => {});
  } catch {}
}
