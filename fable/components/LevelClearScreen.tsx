'use client';

import React, { useState, useEffect } from 'react';
import gameBridge from '../game/systems/GameBridge';
import { Heart, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { ZONE_LEVEL_REWARDS } from '../lib/nft';

const ZONE_PROGRESSION: Record<string, string> = {
  EmberFieldsScene: 'AshwaterMarshScene',
  AshwaterMarshScene: 'ObsidianPeakScene',
  ObsidianPeakScene: 'TownScene',
};

const ZONE_NAMES: Record<string, string> = {
  EmberFieldsScene: 'Ember Fields',
  AshwaterMarshScene: 'Ashwater Marsh',
  ObsidianPeakScene: 'Obsidian Peak',
  TownScene: 'Town Hub',
};

const POTIONS = [
  { id: 'minor',   name: 'Minor Potion',  cost: 15, hp: 30,   full: false, color: 'border-green-500',  activeBg: 'bg-green-950/60',  label: '+30 HP' },
  { id: 'greater', name: 'Greater Potion', cost: 30, hp: 75,   full: false, color: 'border-blue-500',   activeBg: 'bg-blue-950/60',   label: '+75 HP' },
  { id: 'mega',    name: 'Mega Elixir',    cost: 60, hp: 9999, full: true,  color: 'border-purple-500', activeBg: 'bg-purple-950/60', label: 'Full HP' },
];

interface Props {
  clearedZone: string;
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress?: string;
  onContinue: () => void;
}

type RewardState = 'idle' | 'claiming' | 'claimed' | 'already_claimed' | 'no_wallet' | 'not_verified' | 'error';

export default function LevelClearScreen({ clearedZone, playerData, setPlayerData, walletAddress, onContinue }: Props) {
  const [selected, setSelected]       = useState<string | null>(null);
  const [justBought, setJustBought]   = useState<string | null>(null);
  const [rewardState, setRewardState] = useState<RewardState>(walletAddress ? 'claiming' : 'no_wallet');
  const [rewardTx, setRewardTx]       = useState<string | null>(null);

  const nextScene    = ZONE_PROGRESSION[clearedZone] ?? 'TownScene';
  const nextZoneName = ZONE_NAMES[nextScene] ?? 'Town Hub';
  const isFinalZone  = clearedZone === 'ObsidianPeakScene';
  const zoneReward   = ZONE_LEVEL_REWARDS[clearedZone] ?? 0;

  // Claim G$ reward on mount
  useEffect(() => {
    if (!walletAddress || !zoneReward) {
      setRewardState(walletAddress ? 'error' : 'no_wallet');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch('/api/claim-level-reward', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress, zone: clearedZone }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.alreadyClaimed) {
          setRewardState('already_claimed');
        } else if (data.notVerified) {
          setRewardState('not_verified');
        } else if (data.success) {
          setRewardState('claimed');
          setRewardTx(data.txHash);
        } else {
          setRewardState('error');
        }
      } catch {
        if (!cancelled) setRewardState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [walletAddress, clearedZone, zoneReward]);

  const selectedPotion = POTIONS.find(p => p.id === selected) ?? null;
  const canAfford = selectedPotion ? playerData.gold >= selectedPotion.cost : false;

  const buySelected = () => {
    if (!selectedPotion || !canAfford) return;
    setPlayerData((prev: any) => {
      const newHP = selectedPotion.full ? prev.maxHp : Math.min(prev.maxHp, prev.hp + selectedPotion.hp);
      return { ...prev, gold: prev.gold - selectedPotion.cost, hp: newHP };
    });
    setJustBought(selectedPotion.id);
    setSelected(null);
  };

  const handleContinue = () => {
    gameBridge.emit('proceed_to_next_zone', { targetScene: nextScene });
    onContinue();
  };

  const hpPct = Math.min(100, (playerData.hp / playerData.maxHp) * 100);

  return (
    <div className="absolute inset-0 z-50 bg-black/92 flex flex-col items-center justify-center font-mono pointer-events-auto">
      <div className="w-full max-w-sm flex flex-col gap-4 px-6">

        {/* Header */}
        <div className="text-center flex flex-col gap-1">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 size={22} className="text-yellow-400" />
            <h2 className="text-xl font-extrabold text-yellow-400 tracking-widest">ZONE CLEARED!</h2>
          </div>
          <p className="text-zinc-400 text-xs">{ZONE_NAMES[clearedZone] ?? clearedZone} conquered</p>
        </div>

        {/* G$ Reward Banner */}
        {zoneReward > 0 && (
          <div className={`rounded-xl border-2 px-4 py-3 flex items-center gap-3 transition-all ${
            rewardState === 'claimed'        ? 'border-emerald-500 bg-emerald-950/40' :
            rewardState === 'already_claimed'? 'border-zinc-600 bg-zinc-900/40' :
            rewardState === 'claiming'       ? 'border-yellow-800/50 bg-yellow-950/20' :
            rewardState === 'no_wallet'      ? 'border-zinc-700 bg-zinc-900/30' :
            rewardState === 'not_verified'   ? 'border-orange-700/60 bg-orange-950/20' :
                                               'border-red-900/50 bg-red-950/20'
          }`}>
            <span className="text-2xl shrink-0">💲</span>
            <div className="flex-1 min-w-0">
              {rewardState === 'claiming' && (
                <div className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-yellow-400" />
                  <span className="text-[11px] text-yellow-300 font-bold">Sending {zoneReward.toLocaleString()} G$ to your wallet…</span>
                </div>
              )}
              {rewardState === 'claimed' && (
                <>
                  <p className="text-[12px] font-extrabold text-emerald-400">+{zoneReward.toLocaleString()} G$ earned!</p>
                  {rewardTx && !rewardTx.startsWith('mock_') && (
                    <p className="text-[9px] text-zinc-500 truncate">Tx: {rewardTx.slice(0, 16)}…</p>
                  )}
                </>
              )}
              {rewardState === 'already_claimed' && (
                <p className="text-[11px] text-zinc-400">✓ Reward already claimed for this zone</p>
              )}
              {rewardState === 'no_wallet' && (
                <p className="text-[11px] text-zinc-400">Connect wallet to earn {zoneReward.toLocaleString()} G$</p>
              )}
              {rewardState === 'not_verified' && (
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] text-orange-300 font-bold">Verify your identity to earn G$</p>
                  <a
                    href="https://wallet.gooddollar.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-orange-400 underline underline-offset-2 hover:text-orange-300"
                  >
                    Verify on GoodDollar →
                  </a>
                </div>
              )}
              {rewardState === 'error' && (
                <p className="text-[11px] text-red-400">G$ reward failed — try again later</p>
              )}
            </div>
          </div>
        )}

        {/* HP status */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="flex items-center gap-1.5 text-zinc-400 font-bold">
              <Heart size={12} className="text-red-400" /> HP Remaining
            </span>
            <span className="font-bold text-white">{playerData.hp} / {playerData.maxHp}</span>
          </div>
          <div className="w-full bg-zinc-800 h-2 rounded overflow-hidden">
            <div className="bg-red-500 h-full transition-all" style={{ width: `${hpPct}%` }} />
          </div>
        </div>

        {/* Potion Shop */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest">Potion Shop</p>
            <span className="text-[10px] text-yellow-400 font-bold">{playerData.gold} 🪙</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {POTIONS.map(p => {
              const affordable  = playerData.gold >= p.cost;
              const isSelected  = selected === p.id;
              const wasBought   = justBought === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(isSelected ? null : p.id)}
                  disabled={!affordable}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 text-center transition-all select-none
                    ${isSelected ? `${p.activeBg} ${p.color} scale-105 shadow-lg` : affordable ? 'bg-zinc-900 border-zinc-700 hover:border-zinc-500' : 'bg-zinc-900/50 border-zinc-800 opacity-40 cursor-not-allowed'}
                  `}
                >
                  <Heart size={18} className={isSelected ? 'text-white' : 'text-zinc-400'} />
                  <span className={`text-[9px] font-bold leading-tight ${isSelected ? 'text-white' : 'text-zinc-300'}`}>{p.name}</span>
                  <span className={`text-[8px] ${isSelected ? 'text-zinc-200' : 'text-zinc-500'}`}>{p.label}</span>
                  <span className={`text-[9px] font-bold ${affordable ? 'text-yellow-400' : 'text-red-400'}`}>{p.cost} 🪙</span>
                  {wasBought && <span className="text-[8px] text-green-400 font-bold">✓ Used</span>}
                </button>
              );
            })}
          </div>

          <div className={`transition-all overflow-hidden ${selectedPotion ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}>
            {selectedPotion && (
              <button
                onClick={buySelected}
                disabled={!canAfford}
                className={`w-full py-2.5 rounded-lg text-sm font-extrabold tracking-wider transition-all active:scale-95 mt-1
                  ${canAfford
                    ? 'bg-linear-to-r from-green-600 to-emerald-600 hover:brightness-110 text-white shadow-lg shadow-green-900/30'
                    : 'bg-zinc-800 text-red-400 border border-red-900/40 cursor-not-allowed'
                  }`}
              >
                {canAfford ? `Buy ${selectedPotion.name} — ${selectedPotion.cost} 🪙` : `Need ${selectedPotion.cost} 🪙`}
              </button>
            )}
          </div>
        </div>

        {/* Continue */}
        <button
          onClick={handleContinue}
          className="w-full bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 text-black font-extrabold py-3.5 rounded-xl text-sm tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-amber-900/30"
        >
          {isFinalZone
            ? '🏆 Return to Town Hub'
            : <><span>Enter {nextZoneName}</span><ArrowRight size={15} /></>
          }
        </button>
      </div>
    </div>
  );
}
