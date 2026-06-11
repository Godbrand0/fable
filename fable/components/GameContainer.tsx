'use client';

import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { gameConfig } from '../game/config/gameConfig';
import BootScene from '../game/scenes/BootScene';
import TownScene from '../game/scenes/TownScene';
import EmberFieldsScene from '../game/scenes/EmberFieldsScene';
import AshwaterMarshScene from '../game/scenes/AshwaterMarshScene';
import ObsidianPeakScene from '../game/scenes/ObsidianPeakScene';
import gameBridge from '../game/systems/GameBridge';

interface GameContainerProps {
  playerData: any;
}

export default function GameContainer({ playerData }: GameContainerProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);

  // Detect orientation on mount and on change
  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.screen?.orientation?.addEventListener('change', check);
    return () => {
      window.removeEventListener('resize', check);
      window.screen?.orientation?.removeEventListener('change', check);
    };
  }, []);

  useEffect(() => {
    // 1. Initialize Phaser Game on client
    const configWithScenes: Phaser.Types.Core.GameConfig = {
      ...gameConfig,
      scene: [BootScene, TownScene, EmberFieldsScene, AshwaterMarshScene, ObsidianPeakScene],
    };

    const game = new Phaser.Game(configWithScenes);
    gameRef.current = game;

    // 2. Setup initial listener to push character data to scenes when requested
    const unsubReq = gameBridge.on('request_player_data', () => {
      gameBridge.emit('sync_player_data', playerData);
    });

    return () => {
      // 3. Cleanup Game on unmount
      unsubReq();
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
      gameBridge.clear();
    };
  }, []);

  // Update scenes whenever playerData changes
  useEffect(() => {
    if (playerData) {
      gameBridge.emit('sync_player_data', playerData);
    }
  }, [playerData]);

  return (
    <div className="relative flex justify-center items-center w-full bg-black overflow-hidden border-b border-zinc-800 shadow-inner" style={{ aspectRatio: '16/9' }}>
      {/* Rotate-your-phone overlay — shown only on portrait devices */}
      {isPortrait && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 gap-4">
          <div className="text-5xl" style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>📱</div>
          <p className="text-white text-lg font-bold tracking-wide">Rotate your phone</p>
          <p className="text-zinc-400 text-sm">This game is best played in landscape</p>
        </div>
      )}
      <div id="game-canvas-container" className="w-full h-full" />
    </div>
  );
}
