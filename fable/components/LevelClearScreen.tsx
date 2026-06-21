'use client';

import React, { useState } from 'react';
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
  { id: 'minor',   name: 'Minor Potion',  cost: 15, hp: 30,   full: false, color: 'border-green-500',  activeBg: 'bg-green-950/60',  label: '+30 HP' },
  { id: 'greater', name: 'Greater Potion', cost: 30, hp: 75,   full: false, color: 'border-blue-500',   activeBg: 'bg-blue-950/60',   label: '+75 HP' },
  { id: 'mega',    name: 'Mega Elixir',    cost: 60, hp: 9999, full: true,  color: 'border-purple-500', activeBg: 'bg-purple-950/60', label: 'Full HP' },
];

interface Props {
  clearedZone: string;
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  onContinue: () => void;
}

export default function LevelClearScreen({ clearedZone, playerData, setPlayerData, onContinue }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [justBought, setJustBought] = useState<string | null>(null);

  const nextScene    = ZONE_PROGRESSION[clearedZone] ?? 'TownScene';
  const nextZoneName = ZONE_NAMES[nextScene] ?? 'Town Hub';
  const isFinalZone  = clearedZone === 'ObsidianPeakScene';

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
    <div className="absolute inset-0 z-50 bg-black/92 flex flex-col items-center justify-center font-mono">
      <div className="w-full max-w-sm flex flex-col gap-4 px-6">

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
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest">
              Potion Shop
            </p>
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

          {/* Buy button — appears when a potion is selected */}
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
                {canAfford
                  ? `Buy ${selectedPotion.name} — ${selectedPotion.cost} 🪙`
                  : `Need ${selectedPotion.cost} 🪙`
                }
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
