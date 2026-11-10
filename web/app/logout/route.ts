import { NextResponse } from 'next/server';
import { sessionCookie } from '@/lib/session';

export function GET() {
  const res = NextResponse.redirect(new URL('/', process.env.BASE_URL));
  res.cookies.delete(sessionCookie.name);
  return res;
}
