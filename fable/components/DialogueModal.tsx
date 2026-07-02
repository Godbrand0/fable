import React, { useState } from 'react';

interface Props {
  playerName: string;
  onFinish: () => void;
}

const DIALOGUE_STEPS = [
  {
    text: "Greetings, {name}! Welcome to the Vanguard. We've got a monster problem out there, and we need your sword.",
    highlight: null,
  },
  {
    text: "Everything you need lives right here in this Menu. The LEFT joystick moves you and the RIGHT joystick aims your weapon — but both only work once you're out in a combat zone.",
    highlight: null,
  },
  {
    text: "There's also an Ability button, but it only activates once you've bought an ability from the Tavern. Check the Tavern tab first!",
    highlight: 'tavern',
  },
  {
    text: "Slay the beasts in the zones and you'll earn Gold (G) and GoodDollar (G$). Imps drop orbs: Red Orbs heal you, Golden Orbs give Gold.",
    highlight: null,
  },
  {
    text: "Defeat a Level Boss and you earn the coveted Green Orb — real GoodDollar (G$), sent straight to the Bank.",
    highlight: 'bank',
  },
  {
    text: "You can't spend G$ out in the wild though. Visit the Bank tab to claim your rewards, and you can even withdraw G$ to real life after verifying your identity!",
    highlight: 'bank',
  },
  {
    text: "Got coin burning a hole in your pocket? The Tavern sells potions, buffs, weapons and abilities. Spend it wisely.",
    highlight: 'tavern',
  },
  {
    text: "Check Stats and Loadout to build your hero, and Codex to study your enemies. When you're ready, hit Start Game — good luck out there!",
    highlight: 'stats',
  },
];

export default function DialogueModal({ playerName, onFinish }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  const handleNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < DIALOGUE_STEPS.length) {
      setStepIndex(nextIndex);
    } else {
      onFinish();
    }
  };

  const currentStep = DIALOGUE_STEPS[stepIndex];
  const displayText = currentStep.text.replace('{name}', playerName || 'Hero');

  return (
    <div className="absolute inset-0 z-60 bg-black/80 flex items-end justify-center p-4 pointer-events-auto font-mono">
      <div className="w-full max-w-md bg-zinc-950/95 border-2 border-blue-900/50 rounded-xl p-4 shadow-2xl flex gap-4 items-start">
        {/* Avatar */}
        <div className="w-16 h-16 bg-blue-950 border border-blue-800 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-2xl">🧙‍♂️</span>
        </div>

        {/* Text Area */}
        <div className="flex-1 flex flex-col gap-2">
          <span className="text-blue-400 font-bold text-xs uppercase tracking-widest">Guildmaster Thorne</span>
          <p className="text-zinc-200 text-sm leading-relaxed min-h-12">
            {displayText}
          </p>

          <div className="flex justify-between items-center mt-2">
            <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">
              {stepIndex + 1} / {DIALOGUE_STEPS.length}
            </span>
            <button
              onClick={handleNext}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded shadow flex items-center gap-2 active:scale-95 transition-all"
            >
              {stepIndex === DIALOGUE_STEPS.length - 1 ? 'Finish' : 'Next ⏭'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
