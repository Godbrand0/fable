'use client';

import { useCallback, useRef } from 'react';
import { celoService } from '../../lib/celo';
import { VERIFICATION_GATE, GatedAction, NOT_VERIFIED_MESSAGE } from './config';

interface Options {
  walletAddress: string;
  connectWallet: () => Promise<void>;
  showMessage: (msg: string) => void;
  /** Called when a purchase is blocked, e.g. to send the player to the Bank. */
  onNeedsVerification?: () => void;
}

/**
 * Purchase gate: `await ensureVerified('tavernGd')` resolves true when the buyer may proceed.
 *
 * - Checks GoodDollar verification live (same call the Bank uses), connecting the wallet first if needed.
 * - A positive result is cached per address for the session; a negative one never is, so a player who
 *   just verified in the Bank isn't blocked.
 * - If the check itself errors, the purchase is blocked (fail closed) with a "try again" message.
 *
 * Client-side only: it stops the UI, not someone calling the contracts directly.
 */
export function useVerificationGate({ walletAddress, connectWallet, showMessage, onNeedsVerification }: Options) {
  const latest = useRef({ walletAddress, connectWallet, showMessage, onNeedsVerification });
  latest.current = { walletAddress, connectWallet, showMessage, onNeedsVerification };
  const verifiedCache = useRef<Set<string>>(new Set());

  const ensureVerified = useCallback(async (action: GatedAction): Promise<boolean> => {
    if (!VERIFICATION_GATE[action]) return true;
    const { connectWallet: connect, showMessage: say, onNeedsVerification: onBlocked } = latest.current;

    let addr = latest.current.walletAddress;
    if (!addr) {
      await connect();
      addr = (await celoService.getConnectedAddress()) ?? '';
    }
    if (!addr) { say('Connect your wallet and verify with GoodDollar to buy.'); return false; }

    const key = addr.toLowerCase();
    if (verifiedCache.current.has(key)) return true;

    let verified = false;
    try {
      verified = await celoService.isGoodDollarVerified(addr);
    } catch (err) {
      console.error('verification check failed:', err);
      say('Could not check your GoodDollar verification. Please try again.');
      return false;
    }

    if (verified) { verifiedCache.current.add(key); return true; }
    say(NOT_VERIFIED_MESSAGE);
    onBlocked?.();
    return false;
  }, []);

  return { ensureVerified };
}
