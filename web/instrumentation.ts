import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { POSTHOG_HOST as host, POSTHOG_TOKEN as token } from '../src/posthog-config.ts';

let posthogLoggerProvider: LoggerProvider | undefined;
let posthogLogger: ReturnType<LoggerProvider['getLogger']> | undefined;

if (process.env.NEXT_RUNTIME === 'nodejs') {
  posthogLoggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({ 'service.name': 'cronkick-web' }),
    processors: [new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter({
        url: `${host}/i/v1/logs`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeoutMillis: 2000,
      }),
    })],
  });
  posthogLogger = posthogLoggerProvider.getLogger('cronkick.posthog');
}

export function emitPostHogWebLog(body: string, attributes: Record<string, boolean | number | string> = {}) {
  posthogLogger?.emit({ severityText: 'INFO', body, attributes });
}

export async function flushPostHogWebLogs() {
  if (posthogLoggerProvider) await posthogLoggerProvider.forceFlush().catch(() => {});
}

// Server errors from the website go to Sentry (errors only, no tracing). Off without SENTRY_DSN.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/node');
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: 'production', tracesSampleRate: 0 });
}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string }) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/node');
  Sentry.captureException(err, { tags: { route: context.routePath, kind: context.routeType, method: request.method } });
}
