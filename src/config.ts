export class ConfigError extends Error {}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigError(`Missing required env var ${name}`);
  return v;
}

export function dbUrl(): string {
  return need('DATABASE_URL');
}

/** Full app config. Only called by main.ts, so tests don't need GitHub secrets. */
export function loadConfig() {
  return {
    databaseUrl: dbUrl(),
    port: Number(process.env.PORT ?? 3000),
    baseUrl: need('BASE_URL'),
    appId: need('GITHUB_APP_ID'),
    appSlug: need('GITHUB_APP_SLUG'),
    privateKey: need('GITHUB_PRIVATE_KEY').replace(/\\n/g, '\n'),
    webhookSecret: need('GITHUB_WEBHOOK_SECRET'),
    clientId: need('GITHUB_CLIENT_ID'),
    clientSecret: need('GITHUB_CLIENT_SECRET'),
    sessionSecret: need('SESSION_SECRET'),
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    mailFrom: process.env.MAIL_FROM ?? 'Ontime <alerts@ontime.dev>',
    probeRepos: (process.env.PROBE_REPOS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    probeToken: process.env.PROBE_TOKEN ?? '',
  };
}
export type Config = ReturnType<typeof loadConfig>;
