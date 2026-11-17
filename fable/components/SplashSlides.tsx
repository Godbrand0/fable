'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

// Short pitch, also shown on the sign-in screen.
export const GAME_PITCH =
  'Swing your blade through six cursed lands, outfight bosses that fight back, and claim free G$ every day to forge gear you truly own.';

// What a player reads while the world loads. Swipe, tap the dots, use the arrow
// keys, or just wait — it moves on by itself.
export const SPLASH_SLIDES: { icon: string; title: string; text: string }[] = [
  { icon: '🔥', title: 'Welcome, hero', text: GAME_PITCH },
  { icon: '🗺️', title: 'Six cursed lands', text: 'From the sands of Sunfall Dunes to the storms of Stormspire Ruins. Clear each zone of its minions to wake the boss waiting at its heart.' },
  { icon: '👹', title: 'Bosses that fight back', text: 'They circle you, charge when you least expect it and pull imps out of their own bodies. Standing still is not a strategy.' },
  { icon: '⚔️', title: 'Every blade, its own slash', text: 'Green bamboo, clean iron, an Ember Blade that sets demons alight and an Obsidian Greatsword that cuts through three at once.' },
  { icon: '💚', title: 'Free G$, every day', text: 'Verify once with GoodDollar and claim free G$ UBI daily, right inside the game. No purchase needed to play.' },
  { icon: '🍺', title: 'Gear up at the Tavern', text: 'Spend gold on potions and buffs, or G$ on weapons and abilities minted to your wallet as NFTs. They are yours to keep or trade.' },
  { icon: '👥', title: 'Better with friends', text: 'Form a party, drop into a zone together and take the bosses down as a team.' },
];

const AUTO_MS = 4500;
const SWIPE_PX = 40;

export default function SplashSlides() {
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0); // bumps on manual navigation to restart the auto timer
  const startX = useRef<number | null>(null);
  const n = SPLASH_SLIDES.length;

  const go = useCallback((i: number) => {
    setIndex(((i % n) + n) % n);
    setTick((t) => t + 1);
  }, [n]);

  useEffect(() => {
    const t = setTimeout(() => setIndex((i) => (i + 1) % n), AUTO_MS);
    return () => clearTimeout(t);
  }, [index, tick, n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  const onPointerDown = (e: React.PointerEvent) => { startX.current = e.clientX; };
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (dx <= -SWIPE_PX) go(index + 1);
    else if (dx >= SWIPE_PX) go(index - 1);
  };

  return (
    <div className="w-full max-w-md select-none" aria-roledescription="carousel" aria-label="About Fable">
      <div
        className="overflow-hidden touch-pan-y cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { startX.current = null; }}
      >
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SPLASH_SLIDES.map((s, i) => (
            <div
              key={s.title}
              className="w-full shrink-0 px-6 flex flex-col items-center text-center gap-2"
              aria-hidden={i !== index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${n}`}
            >
              <span className="text-2xl" aria-hidden>{s.icon}</span>
              <h2 className="text-sm font-bold text-amber-400 tracking-wider uppercase">{s.title}</h2>
              <p className="text-sm leading-relaxed text-zinc-300 min-h-[4.5rem]">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-1.5">
        {SPLASH_SLIDES.map((s, i) => (
          <button
            key={s.title}
            onClick={() => go(i)}
            aria-label={`Show slide ${i + 1}: ${s.title}`}
            aria-current={i === index}
            className="p-1.5"
          >
            <span className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-amber-400' : 'w-1.5 bg-zinc-700'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
