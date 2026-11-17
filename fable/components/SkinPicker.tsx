'use client';

import React from 'react';
import { SKIN_PALETTES } from '../lib/skins';

// The same animated hero sheets the game uses (public/sprites/hero_*.png): one row of
// 96×64 frames, idle = frames 0–3. The preview loops the idle frames, cropped to the
// character, so what a player picks is exactly what they'll see in-game.
const FRAME_W = 96;
const IDLE_FRAMES = 4;
const CROP = { x: 24, y: 8, w: 64, h: 56 }; // character + staff, inside each frame
const SCALE = 1.5;                           // 3 device px per art pixel on retina screens

const sheetFor = (skinId: string) => (skinId === 'human' ? 'hero_bamboo' : `hero_${skinId}_bamboo`);

function SkinPreview({ skinId }: { skinId: string }) {
  const start = -CROP.x * SCALE;
  const end = start - IDLE_FRAMES * FRAME_W * SCALE;
  return (
    <div
      className="skin-preview"
      style={{
        width: CROP.w * SCALE,
        height: CROP.h * SCALE,
        backgroundImage: `url(/sprites/${sheetFor(skinId)}.png)`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${FRAME_W * 18 * SCALE}px ${64 * SCALE}px`,
        backgroundPosition: `${start}px ${-CROP.y * SCALE}px`,
        imageRendering: 'pixelated',
        ['--idle-start' as string]: `${start}px`,
        ['--idle-end' as string]: `${end}px`,
        ['--idle-y' as string]: `${-CROP.y * SCALE}px`,
      }}
    />
  );
}

const PREVIEW_CSS = `
@keyframes skin-idle { from { background-position: var(--idle-start) var(--idle-y); } to { background-position: var(--idle-end) var(--idle-y); } }
.skin-preview { animation: skin-idle 1s steps(${IDLE_FRAMES}) infinite; }
@media (prefers-reduced-motion: reduce) { .skin-preview { animation: none; } }
`;

interface SkinPickerProps {
  selected: string;
  onSelect: (skinId: string) => void;
}

export default function SkinPicker({ selected, onSelect }: SkinPickerProps) {
  const activePalette = SKIN_PALETTES[selected];

  return (
    <div className="flex flex-col gap-1.5">
      <style>{PREVIEW_CSS}</style>
      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Choose Your Look</label>
      <div className="grid grid-cols-3 gap-2">
        {Object.values(SKIN_PALETTES).map((p) => {
          const isSelected = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`flex flex-col items-center gap-1 py-2 rounded-xl border-2 transition-all active:scale-95 ${
                isSelected ? 'border-yellow-500 bg-yellow-950/20' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
              }`}
            >
              <div className="bg-black/40 rounded-lg p-1">
                <SkinPreview skinId={p.id} />
              </div>
              <span className={`text-[9px] font-bold ${isSelected ? 'text-yellow-400' : 'text-zinc-300'}`}>{p.name}</span>
            </button>
          );
        })}
      </div>
      {activePalette && <p className="text-[9px] text-zinc-600 text-center">{activePalette.desc}</p>}
    </div>
  );
}
