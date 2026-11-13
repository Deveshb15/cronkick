import { createPublicKey, verify } from 'node:crypto';
import type { Db } from './db.ts';

// Run receipts: an agent recipe's last step POSTs what the run did, signed with a GitHub Actions OIDC token.
// Input from the internet: the token is verified against GitHub's keys, the body is capped and whitelisted, and a
// receipt is only kept on a slot Cronkick dispatched, in that same repository, once.

export const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const JWKS_TTL_MS = 60 * 60_000;
/** An unknown kid refetches the keys at most this often, so random kids can't make us hammer GitHub. */
const REFETCH_MS = 60_000;
const SKEW_S = 60;
export const MAX_BODY = 2048;

export type Jwk = { kid?: string; kty?: string; n?: string; e?: string; [k: string]: unknown };
/** Key for a kid, or undefined when GitHub doesn't publish one. Injected in tests. */
export type KeySource = (kid: string, nowMs: number) => Promise<Jwk | undefined>;
export class BadToken extends Error {}

export const fetchJwks = async (): Promise<{ keys: Jwk[] }> => {
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  return res.json() as Promise<{ keys: Jwk[] }>;
};

/** GitHub's signing keys, cached for an hour; an unknown kid refetches once (GitHub rotates keys). */
export function jwksCache(get: () => Promise<{ keys: Jwk[] }> = fetchJwks): KeySource {
  let keys: Jwk[] | null = null;
  let at = 0;
  return async (kid, now) => {
    if (!keys || now - at > JWKS_TTL_MS) { keys = (await get()).keys; at = now; }
    let k = keys.find((x) => x.kid === kid);
    if (!k && now - at > REFETCH_MS) { keys = (await get()).keys; at = now; k = keys.find((x) => x.kid === kid); }
    return k;
  };
}

export type Claims = { iss: string; aud: string | string[]; exp: number; nbf?: number; repository_id: string; run_id: string; [k: string]: unknown };

const json = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** The claims of a GitHub Actions OIDC token issued for `audience`; throws BadToken otherwise. */
export async function verifyActionsOidc(token: string, audience: string, now: Date, keyFor: KeySource): Promise<Claims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new BadToken('malformed token');
  let header: any, claims: any;
  try { header = json(parts[0]); claims = json(parts[1]); } catch { throw new BadToken('malformed token'); }
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string') throw new BadToken('unsupported algorithm');
  const jwk = await keyFor(header.kid, now.getTime());
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) throw new BadToken('unknown key');
  const key = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
  if (!verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) throw new BadToken('bad signature');
  if (claims?.iss !== ISSUER) throw new BadToken('wrong issuer');
  if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience)) throw new BadToken('wrong audience');
  const t = now.getTime() / 1000;
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_S < t) throw new BadToken('expired');
  if (typeof claims.nbf === 'number' && claims.nbf - SKEW_S > t) throw new BadToken('not yet valid');
  return claims as Claims;
}

export const OUTCOMES = ['pr', 'issue', 'comment', 'message', 'skipped', 'noop', 'failed'] as const;
export type Receipt = {
  v: 1; recipe: string; engine: string; outcome: (typeof OUTCOMES)[number];
  url?: string; reason?: string; turns?: number; cost_usd?: number;
};

const NAME = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const num = (x: unknown, max: number) => x === undefined || x === null ? undefined : typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? x : NaN;

/** The whitelisted receipt, or null when any field is wrong. `url` is checked later, against the slot's repository. */
export function parseReceipt(body: string): Receipt | null {
  if (Buffer.byteLength(body) > MAX_BODY) return null;
  let b: any;
  try { b = JSON.parse(body); } catch { return null; }
  if (!b || typeof b !== 'object' || b.v !== 1) return null;
  if (typeof b.recipe !== 'string' || !NAME.test(b.recipe) || typeof b.engine !== 'string' || !NAME.test(b.engine)) return null;
  if (!OUTCOMES.includes(b.outcome)) return null;
  if (b.url != null && (typeof b.url !== 'string' || b.url.length > 500)) return null;
  if (b.reason != null && (typeof b.reason !== 'string' || b.reason.length > 200)) return null;
  const turns = num(b.turns, 100_000);
  const cost = num(b.cost_usd, 100_000);
  if (Number.isNaN(turns) || Number.isNaN(cost)) return null;
  const r: Receipt = { v: 1, recipe: b.recipe, engine: b.engine, outcome: b.outcome };
  if (b.url) r.url = b.url;
  if (b.reason) r.reason = b.reason.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (turns !== undefined) r.turns = Math.round(turns);
  if (cost !== undefined) r.cost_usd = cost;
  return r;
}

/** A github.com link inside `repo` (after resolving `..`), normalised; null otherwise. */
export function repoUrl(url: string, repo: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const ok = u.protocol === 'https:' && u.host === 'github.com' && !u.username && !u.password
    && u.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/`);
  return ok ? u.href : null;
}

/** 204 stored (or already had one: the first receipt wins), 400 bad body, 404 no slot of ours ran it. */
export async function storeReceipt(db: Db, claims: Claims, body: string): Promise<204 | 400 | 404> {
  const r = parseReceipt(body);
  if (!r) return 400;
  const runId = Number(claims.run_id);
  const repoId = Number(claims.repository_id);
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(repoId)) return 404;
  const { rows: [slot] } = await db.query(
    `SELECT s.id, r.full_name FROM slots s JOIN repos r ON r.id = s.repo_id JOIN installations i ON i.id = r.installation_id
      WHERE s.run_id = $1 AND r.id = $2 AND r.active AND NOT i.removed LIMIT 1`,
    [runId, repoId],
  );
  if (!slot) return 404;
  if (r.url) {
    const url = repoUrl(r.url, slot.full_name);
    if (!url) return 400;
    r.url = url;
  }
  await db.query('UPDATE slots SET receipt = $1, receipt_at = now() WHERE id = $2 AND receipt IS NULL', [JSON.stringify(r), slot.id]);
  return 204;
}
