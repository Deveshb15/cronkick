import { readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';

/** GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"); the JWT signer needs PKCS#8. */
export const pkcs8 = (pem: string) => createPrivateKey(pem).export({ type: 'pkcs8', format: 'pem' }).toString();

export class ConfigError extends Error {}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigError(`Missing required env var ${name}`);
  return v;
}

export function dbUrl(): string {
  return need('DATABASE_URL');
}

/**
 * A direct (unpooled) connection, for the two things a transaction-mode pooler can't do: the migration advisory
 * lock and LISTEN. Falls back to DATABASE_URL when there is no pooler.
 */
export function directDbUrl(): string {
  return process.env.DATABASE_DIRECT_URL || dbUrl();
}

/** Probe repos for /lateness. The web server reads this too (same env file), so its report covers every configured repo. */
export function probeRepos(): string[] {
  return (process.env.PROBE_REPOS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Full app config. Only called by main.ts, so tests don't need GitHub secrets. */
export function loadConfig() {
  return {
    databaseUrl: dbUrl(),
    port: Number(process.env.WORKER_PORT ?? 3001),
    baseUrl: need('BASE_URL'),
    appId: need('GITHUB_APP_ID'),
    // A file is the safe way on servers (systemd env files mangle \n); the one-line env var is for local runs.
    privateKey: pkcs8(process.env.GITHUB_PRIVATE_KEY_FILE
      ? readFileSync(process.env.GITHUB_PRIVATE_KEY_FILE, 'utf8')
      : need('GITHUB_PRIVATE_KEY').replace(/\\n/g, '\n')),
    webhookSecret: need('GITHUB_WEBHOOK_SECRET'),
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    mailFrom: process.env.MAIL_FROM ?? 'Cronkick <alerts@cronkick.xyz>',
    probeRepos: probeRepos(),
    probeToken: process.env.PROBE_TOKEN ?? '',
    // Optional until billing is set up; the Dodo webhook answers 503 without it.
    dodoWebhookSecret: process.env.DODO_WEBHOOK_SECRET ?? '',
  };
}
export type Config = ReturnType<typeof loadConfig>;
