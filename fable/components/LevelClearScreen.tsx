'use client';

import React from 'react';
import gameBridge from '../game/systems/GameBridge';
import { Heart, ArrowRight, CheckCircle2 } from 'lucide-react';

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
  { id: 'minor',   name: 'Minor Potion',  cost: 15, hp: 30,   full: false, color: 'from-green-800 to-green-900 border-green-600' },
  { id: 'greater', name: 'Greater Potion', cost: 30, hp: 75,   full: false, color: 'from-blue-800 to-blue-900 border-blue-600' },
  { id: 'mega',    name: 'Mega Elixir',    cost: 60, hp: 9999, full: true,  color: 'from-purple-800 to-purple-900 border-purple-600' },
];

interface Props {
  clearedZone: string;
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  onContinue: () => void;
}

export default function LevelClearScreen({ clearedZone, playerData, setPlayerData, onContinue }: Props) {
  const nextScene = ZONE_PROGRESSION[clearedZone] ?? 'TownScene';
  const nextZoneName = ZONE_NAMES[nextScene] ?? 'Town Hub';
  const isFinalZone = clearedZone === 'ObsidianPeakScene';

  const buyPotion = (potion: typeof POTIONS[0]) => {
    if (playerData.gold < potion.cost) return;
    setPlayerData((prev: any) => {
      const newHP = potion.full ? prev.maxHp : Math.min(prev.maxHp, prev.hp + potion.hp);
      return { ...prev, gold: prev.gold - potion.cost, hp: newHP };
    });
  };

  const handleContinue = () => {
    gameBridge.emit('proceed_to_next_zone', { targetScene: nextScene });
    onContinue();
  };

  const hpPct = Math.min(100, (playerData.hp / playerData.maxHp) * 100);

  return (
    <div className="absolute inset-0 z-50 bg-black/92 flex flex-col items-center justify-center font-mono">
      <div className="w-full max-w-sm flex flex-col gap-5 px-6">

        {/* Header */}
        <div className="text-center flex flex-col gap-1">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 size={22} className="text-yellow-400" />
            <h2 className="text-xl font-extrabold text-yellow-400 tracking-widest">ZONE CLEARED!</h2>
          </div>
          <p className="text-zinc-400 text-xs">{ZONE_NAMES[clearedZone] ?? clearedZone} conquered</p>
        </div>

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
          <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest">
            Potion Shop — spend gold before the next zone
          </p>

          {POTIONS.map(p => {
            const canAfford = playerData.gold >= p.cost;
            return (
              <button
                key={p.id}
                onClick={() => buyPotion(p)}
                disabled={!canAfford}
                className={`flex justify-between items-center p-3 rounded-lg border text-xs font-bold transition-all active:scale-95 ${
                  canAfford
                    ? `bg-gradient-to-r ${p.color} text-white hover:brightness-110`
                    : 'bg-zinc-900 border-zinc-700 text-zinc-500 cursor-not-allowed'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Heart size={11} />
                  {p.name}
                  <span className="text-[10px] opacity-70">{p.full ? '(Full HP)' : `+${p.hp} HP`}</span>
                </span>
                <span>{p.cost} 🪙</span>
              </button>
            );
          })}

          <p className="text-right text-[10px] text-yellow-400 font-bold">
            Your gold: {playerData.gold} 🪙
          </p>
        </div>

        {/* Continue */}
        <button
          onClick={handleContinue}
          className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:brightness-110 text-black font-extrabold py-3.5 rounded-xl text-sm tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-amber-900/30"
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
