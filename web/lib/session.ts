import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers.js';

export type Session = { login: string; installs: number[]; iat: number; exp: number };

const COOKIE = 'cronkick_session';
const TTL_MS = 60 * 60_000; // short, so losing access to an org takes effect within the hour

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
};
const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

/** `<base64 json>.<hmac>`. Holds only the login and installation ids, never a GitHub token. */
export function encodeSession(s: Omit<Session, 'iat' | 'exp'>, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...s, iat: now, exp: now + TTL_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeSession(raw: string | undefined, now = Date.now()): Session | null {
  if (!raw) return null;
  const [body, mac] = raw.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    return s.exp > now ? s : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  return decodeSession((await cookies()).get(COOKIE)?.value);
}

export const sessionCookie = { name: COOKIE, maxAge: TTL_MS / 1000 };
