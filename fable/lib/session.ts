import crypto from 'crypto';
import type { NextRequest } from 'next/server';

// Player sessions: proof that the caller controls a wallet, established once per
// sign-in by verifying a signed message (see /api/auth/login). Every route that
// moves value or writes player data reads the wallet from this cookie and ignores
// any wallet address in the request body.

export const PLAYER_SESSION_COOKIE = 'fable_session';
export const PLAYER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Signed-in messages older than this are rejected, which limits replay of a captured signature.
export const LOGIN_MESSAGE_MAX_AGE_MS = 10 * 60 * 1000;

let devSecret: string | null = null;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is not configured');
  }
  // Local dev only: a per-process secret, so sessions reset when the dev server restarts.
  if (!devSecret) devSecret = crypto.randomBytes(32).toString('hex');
  return devSecret;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

// Token = "<wallet>.<expiresAtMs>.<hmac>". The wallet is lowercase hex, so it never contains '.'.
export function createPlayerSessionToken(wallet: string): string {
  const payload = `${wallet.toLowerCase()}.${Date.now() + PLAYER_SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyPlayerSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [wallet, expiresAtStr, sig] = parts;
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const expected = Buffer.from(sign(`${wallet}.${expiresAtStr}`));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return wallet;
}

/** The lowercase wallet address the caller has proven they control, or null. */
export function getSessionWallet(req: NextRequest): string | null {
  return verifyPlayerSessionToken(req.cookies.get(PLAYER_SESSION_COOKIE)?.value);
}
