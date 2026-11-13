import { NextResponse } from 'next/server';
import { captureServerEvent, distinctIdFor } from '@/lib/posthog-server';
import { getSession, sessionCookie } from '@/lib/session';

export async function GET() {
  const s = await getSession();
  if (s) await captureServerEvent(distinctIdFor(s), 'signed_out');
  const res = NextResponse.redirect(new URL('/', process.env.BASE_URL));
  res.cookies.delete(sessionCookie.name);
  return res;
}
