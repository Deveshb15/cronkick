import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import type { App } from '@octokit/app';

export type Session = { login: string; installs: number[]; exp: number };
const COOKIE = 'ontime_session';
const TTL_MS = 60 * 60_000; // short, so losing access to an org takes effect within the hour

/** GitHub sign-in, as an interface so tests can fake it. */
export interface OAuth {
  authorizeUrl(state: string): string;
  /** Exchange the code; return who signed in and which installations GitHub says they can access (P1). */
  exchange(code: string): Promise<{ login: string; installs: number[] }>;
}

export function githubOAuth(app: App, redirectUrl: string): OAuth {
  return {
    authorizeUrl: (state) => app.oauth.getWebFlowAuthorizationUrl({ state, redirectUrl }).url,
    async exchange(code) {
      const { authentication } = await app.oauth.createToken({ code });
      const gh = (path: string) => fetch(`https://api.github.com${path}`, {
        headers: { authorization: `Bearer ${authentication.token}`, accept: 'application/vnd.github+json' },
      }).then((r) => { if (!r.ok) throw new Error(`GitHub ${path}: ${r.status}`); return r.json(); });
      const user = await gh('/user');
      const installs: number[] = [];
      for (let page = 1; ; page++) {
        const res = await gh(`/user/installations?per_page=100&page=${page}`);
        installs.push(...res.installations.map((i: any) => i.id));
        if (res.installations.length < 100) break;
      }
      return { login: user.login, installs };
    },
  };
}

// The cookie is signed, not encrypted: it holds only the login and installation ids, never a token.
export async function readSession(c: Context, secret: string): Promise<Session | null> {
  const raw = await getSignedCookie(c, secret, COOKIE);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export async function writeSession(c: Context, secret: string, s: Omit<Session, 'exp'>, secure: boolean) {
  await setSignedCookie(c, COOKIE, JSON.stringify({ ...s, exp: Date.now() + TTL_MS }), secret, {
    httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: TTL_MS / 1000,
  });
}

export const clearSession = (c: Context) => deleteCookie(c, COOKIE, { path: '/' });
