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
