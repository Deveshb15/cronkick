import { NextResponse, type NextRequest } from 'next/server';
import { encodeSession, sessionCookie } from '@/lib/session';

async function gh(path: string, token: string) {
  const res = await fetch(`https://api.github.com${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !state || state !== req.cookies.get('oauth_state')?.value) {
    return new NextResponse('Sign-in expired. Go back and try again.', { status: 400 });
  }
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }),
  });
  const { access_token: token } = await tokenRes.json();
  if (!token) return new NextResponse('GitHub sign-in failed. Try again.', { status: 400 });

  const user = await gh('/user', token);
  const installs: number[] = [];
  for (let page = 1; ; page++) {
    const res = await gh(`/user/installations?per_page=100&page=${page}`, token);
    installs.push(...res.installations.map((i: { id: number }) => i.id));
    if (res.installations.length < 100) break;
  }
  // The token is dropped here; the session keeps only who signed in and what they can see.
  const res = NextResponse.redirect(new URL(req.cookies.get('oauth_next')?.value ?? '/dashboard', process.env.BASE_URL));
  res.cookies.set(sessionCookie.name, encodeSession({ login: user.login, installs }), {
    httpOnly: true, secure: process.env.BASE_URL?.startsWith('https://'), sameSite: 'lax', path: '/', maxAge: sessionCookie.maxAge,
  });
  res.cookies.delete('oauth_state');
  res.cookies.delete('oauth_next');
  return res;
}
