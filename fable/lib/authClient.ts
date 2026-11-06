'use client';

import { celoService } from './celo';
import { buildLoginMessage } from './loginMessage';

// Makes sure the browser holds a server session for `address`, asking the wallet to
// sign a sign-in message if it doesn't. Every server route that pays out or writes
// player data trusts only this session, so call it right after a wallet connects.
export async function ensureSession(address: string): Promise<void> {
  const wallet = address.toLowerCase();

  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    const { wallet: current } = await res.json();
    if (current === wallet) return;
  } catch { /* fall through and sign in */ }

  const issuedAt = new Date().toISOString();
  const signature = await celoService.signMessage(address, buildLoginMessage(wallet, issuedAt));

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, issuedAt, signature }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Sign-in failed');
  }
}

export async function endSession(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
}
