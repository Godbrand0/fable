'use client';

import React, { useEffect, useState } from 'react';
import { Gift, Loader2, Copy, Check, Users } from 'lucide-react';
import type { Address } from 'viem';
import { publicClient } from '../lib/celo';
import {
  AppProgram, ENGAGEMENT_ABI, ENGAGEMENT_APP_ADDRESS, ENGAGEMENT_REWARDS_ADDRESS,
  canClaimBonus, claimWelcomeBonus, engagementEnabled, getAppProgram, inviteLink,
} from '../lib/engagementRewards';

interface Props {
  walletAddress: string;
  isVerified: boolean | null;
  onClaimed: () => void;
  showMessage: (msg: string) => void;
}

type Status = 'loading' | 'eligible' | 'claimed' | 'unverified' | 'unavailable';

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** GoodDollar Engagement Rewards: one-time welcome bonus for verified players, plus invite links. */
export default function WelcomeBonusCard({ walletAddress, isVerified, onClaimed, showMessage }: Props) {
  const [program, setProgram] = useState<AppProgram | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);

  const real = walletAddress.startsWith('0x');

  useEffect(() => {
    if (!engagementEnabled() || !real || isVerified === null) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getAppProgram();
        if (cancelled) return;
        if (!p?.registered || !p.approved) { setStatus('unavailable'); return; }
        setProgram(p);
        if (!isVerified) { setStatus('unverified'); return; }
        const [, lastClaim] = await publicClient.readContract({
          address: ENGAGEMENT_REWARDS_ADDRESS, abi: ENGAGEMENT_ABI, functionName: 'userRegistrations',
          args: [ENGAGEMENT_APP_ADDRESS as Address, walletAddress as Address],
        });
        if (cancelled) return;
        if (lastClaim > 0) { setStatus('claimed'); return; }
        setStatus((await canClaimBonus(walletAddress as Address)) ? 'eligible' : 'unavailable');
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [walletAddress, isVerified, real]);

  if (!engagementEnabled() || !real || !program || status === 'loading' || status === 'unavailable') return null;

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    const r = await claimWelcomeBonus(walletAddress);
    setClaiming(false);
    if (r.ok) {
      setStatus('claimed');
      showMessage(`Welcome bonus claimed: +${fmt(program.playerGd)} G$!`);
      onClaimed();
    } else {
      showMessage(r.error);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(walletAddress));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showMessage(inviteLink(walletAddress));
    }
  };

  return (
    <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Gift size={16} className="text-amber-400 shrink-0" />
        <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">GoodDollar Welcome Bonus</span>
      </div>

      {status === 'unverified' && (
        <p className="text-[10px] text-zinc-400 leading-normal">
          Verify with GoodDollar above to unlock a one-time <span className="text-amber-300 font-bold">{fmt(program.playerGd)} G$</span> welcome bonus.
        </p>
      )}

      {status === 'eligible' && (
        <>
          <p className="text-[10px] text-zinc-400 leading-normal">
            You&apos;re verified. Claim <span className="text-amber-300 font-bold">{fmt(program.playerGd)} G$</span>, paid by GoodDollar. You&apos;ll sign one message and approve one transaction.
          </p>
          <button
            onClick={claim}
            disabled={claiming}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-black font-bold py-2.5 rounded-lg text-xs tracking-wider active:scale-95 transition-all flex justify-center items-center gap-2"
          >
            {claiming ? <><Loader2 size={14} className="animate-spin" /> Claiming…</> : `Claim ${fmt(program.playerGd)} G$`}
          </button>
        </>
      )}

      {status === 'claimed' && (
        <p className="text-[10px] text-emerald-400 font-bold">✓ Welcome bonus claimed</p>
      )}

      {program.inviterGd > 0 && (
        <div className="border-t border-amber-900/30 pt-2.5 flex flex-col gap-1.5">
          <p className="text-[10px] text-zinc-400 leading-normal flex gap-1.5">
            <Users size={12} className="text-amber-500 shrink-0 mt-px" />
            <span>Invite friends: you earn <span className="text-amber-300 font-bold">{fmt(program.inviterGd)} G$</span> when each one verifies and claims their bonus.</span>
          </p>
          <button
            onClick={copyInvite}
            className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-[10px] font-bold py-2 rounded-lg flex justify-center items-center gap-1.5 active:scale-95 transition-all"
          >
            {copied ? <><Check size={12} className="text-emerald-400" /> Link copied</> : <><Copy size={12} /> Copy invite link</>}
          </button>
        </div>
      )}
    </div>
  );
}
