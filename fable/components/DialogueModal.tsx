import React, { useState, useEffect } from 'react';
import gameBridge from '../game/systems/GameBridge';

interface Props {
  playerName: string;
}

const DIALOGUE_STEPS = [
  {
    text: "Greetings, {name}! Welcome to the Vanguard. We've got a monster problem outside these walls, and we need your sword.",
    target: 'guide'
  },
  {
    text: "To the South lies the Gates. They lead to the Ember Fields and beyond. Slay the beasts there, and you'll earn Gold and GoodDollar.",
    target: 'gates'
  },
  {
    text: "But beware! You can't spend your G$ while out in the wild. Once you clear a zone, you must return here and visit the Bank to the Northwest to secure your rewards.",
    target: 'bank'
  },
  {
    text: "Got some coin burning a hole in your pocket? Visit the Tavern to the North. You can buy stronger weapons and powerful abilities to help you survive.",
    target: 'tavern'
  },
  {
    text: "That's all you need to know. Good luck out there!",
    target: 'player'
  }
];

export default function DialogueModal({ playerName }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    // Initial camera pan
    gameBridge.emit('guide_camera_pan', { target: DIALOGUE_STEPS[0].target });
  }, []);

  const handleNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < DIALOGUE_STEPS.length) {
      setStepIndex(nextIndex);
      gameBridge.emit('guide_camera_pan', { target: DIALOGUE_STEPS[nextIndex].target });
    } else {
      gameBridge.emit('end_guide_talk');
    }
  };

  const currentStep = DIALOGUE_STEPS[stepIndex];
  const displayText = currentStep.text.replace('{name}', playerName || 'Hero');

  return (
    <div className="absolute bottom-4 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-auto font-mono">
      <div className="bg-zinc-950/90 border-2 border-blue-900/50 rounded-xl p-4 shadow-2xl flex gap-4 items-start">
        {/* Avatar */}
        <div className="w-16 h-16 bg-blue-950 border border-blue-800 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-2xl">🧙‍♂️</span>
        </div>
        
        {/* Text Area */}
        <div className="flex-1 flex flex-col gap-2">
          <span className="text-blue-400 font-bold text-xs uppercase tracking-widest">Guildmaster Thorne</span>
          <p className="text-zinc-200 text-sm leading-relaxed min-h-[3rem]">
            {displayText}
          </p>
          
          <div className="flex justify-end mt-2">
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
