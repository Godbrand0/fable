import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_TTL_MS, createAdminSessionToken } from '../../../../lib/adminAuth';

export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: 'Admin dashboard is not configured (ADMIN_PASSWORD or ADMIN_SESSION_SECRET unset)' }, { status: 500 });
  }

  const { password } = await req.json() as { password?: string };
  // Compare fixed-length digests so neither the result nor the timing reveals the password length.
  const suppliedHash = crypto.createHash('sha256').update(password || '').digest();
  const expectedHash = crypto.createHash('sha256').update(adminPassword).digest();
  const matches = crypto.timingSafeEqual(suppliedHash, expectedHash);
  if (!matches) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const token = createAdminSessionToken()!;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  });
  return res;
}
