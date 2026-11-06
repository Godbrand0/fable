import crypto from 'crypto';

export const ADMIN_SESSION_COOKIE = 'fable_admin_session';
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// The signing key mixes a dedicated ADMIN_SESSION_SECRET with the current password.
// Changing either one invalidates every existing admin session, which is how you
// revoke a session (logout only clears the cookie in that one browser). The password
// alone is never used as the key, so a leaked cookie isn't an offline test for it.
function signingKey(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const password = process.env.ADMIN_PASSWORD;
  if (!secret || !password) return null;
  return crypto.createHash('sha256').update(`${secret}\0${password}`).digest('hex');
}

function sign(payload: string, key: string): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

// Session token = "<expiresAtMs>.<hmac>" — no password material stored client-side.
export function createAdminSessionToken(): string | null {
  const key = signingKey();
  if (!key) return null;
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  return `${expiresAt}.${sign(String(expiresAt), key)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null): boolean {
  const key = signingKey();
  if (!key || !token) return false;

  const [expiresAtStr, sig] = token.split('.');
  if (!expiresAtStr || !sig) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(sign(expiresAtStr, key));
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}
