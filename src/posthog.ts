import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { PostHog } from 'posthog-node';
import { POSTHOG_HOST, POSTHOG_TOKEN } from './posthog-config.ts';

type Props = Record<string, boolean | number | string | null>;

// Off under vitest, so tests never send events.
const on = !process.env.VITEST;
const client = on ? new PostHog(POSTHOG_TOKEN, { host: POSTHOG_HOST, enableExceptionAutocapture: true, requestTimeout: 3000 }) : undefined;
const provider = on ? new LoggerProvider({
  resource: resourceFromAttributes({ 'service.name': 'cronkick-worker' }),
  processors: [new BatchLogRecordProcessor({
    exporter: new OTLPLogExporter({
      url: `${POSTHOG_HOST}/i/v1/logs`,
      headers: { Authorization: `Bearer ${POSTHOG_TOKEN}`, 'Content-Type': 'application/json' },
    }),
  })],
}) : undefined;
const logger = provider?.getLogger('cronkick.posthog');

/** Product event from the worker. Without a user (`github:<id>`) it is filed under the installation, with no person profile. */
export function track(event: string, installationId: number | undefined, properties: Props = {}, user?: number) {
  if (!client) return;
  try {
    client.capture({
      distinctId: user ? `github:${user}` : `installation:${installationId ?? 'none'}`,
      event,
      properties: { ...properties, installation_id: installationId ?? null, ...(user ? {} : { $process_person_profile: false }) },
      ...(installationId ? { groups: { installation: String(installationId) } } : {}),
    });
  } catch {}
}

/** Keep the installation's group profile (account, plan) current, so every event can be broken down by it. */
export function identifyInstallation(installationId: number, properties: Props) {
  try { client?.groupIdentify({ groupType: 'installation', groupKey: String(installationId), properties }); } catch {}
}

export function emitPostHogWorkerLog(body: string, attributes: Record<string, boolean | number | string> = {}) {
  logger?.emit({ severityText: 'INFO', body, attributes });
}

export async function shutdownPostHogWorkerLogs() {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  await Promise.race([Promise.all([provider?.forceFlush(), client?.shutdown()]), timeout]).catch(() => {});
  await provider?.shutdown().catch(() => {});
}
