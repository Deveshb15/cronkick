import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export function GET(req: NextRequest) {
  const state = randomBytes(16).toString('hex');
  const next = req.nextUrl.searchParams.get('next') ?? '/dashboard';
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', `${process.env.BASE_URL}/callback`);
  url.searchParams.set('state', state);
  const res = NextResponse.redirect(url);
  const opts = { httpOnly: true, secure: process.env.BASE_URL?.startsWith('https://'), sameSite: 'lax' as const, path: '/', maxAge: 600 };
  res.cookies.set('oauth_state', state, opts);
  // Only same-site paths, so the login can't be used to bounce people to another site.
  res.cookies.set('oauth_next', next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard', opts);
  return res;
}
