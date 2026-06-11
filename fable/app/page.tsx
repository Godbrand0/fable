'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { dbService } from '../lib/supabaseClient';
import { celoService } from '../lib/celo';
import HUD from '../components/HUD';
import { Shield, Sword, Heart, Compass, Wallet2, Check } from 'lucide-react';

// Dynamically import the GameContainer so it doesn't run during server-side rendering
const GameContainer = dynamic(() => import('../components/GameContainer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center w-full h-[60vh] bg-zinc-950 text-zinc-400 font-mono gap-3">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <span>Loading Fable Game Engine...</span>
    </div>
  ),
});

export default function Home() {
  const [playerData, setPlayerData] = useState<any>(null);
  const [charName, setCharName] = useState('');
  const [selectedClass, setSelectedClass] = useState<'knight' | 'ranger' | 'berserker'>('knight');
  const [loading, setLoading] = useState(true);

  // Wallet states
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [gDollarBalance, setGDollarBalance] = useState('0.00');

  useEffect(() => {
    const initGame = async () => {
      let activeAddress = 'local_player';
      try {
        const addr = await celoService.getConnectedAddress();
        if (addr) {
          setWalletAddress(addr);
          setWalletConnected(true);
          activeAddress = addr;
          const bal = await celoService.getG$Balance(addr);
          setGDollarBalance(bal);
        }
      } catch (e) {
        console.log('No wallet connected initially, using local profile.');
      }

      try {
        const player = await dbService.getPlayer(activeAddress);
        if (player) {
          setPlayerData(player);
        }
      } catch (err) {
        console.error('Error loading player data:', err);
      } finally {
        setLoading(false);
      }
    };
    initGame();
  }, []);

  const connectWallet = async () => {
    try {
      const addr = await celoService.connectWallet();
      setWalletAddress(addr);
      setWalletConnected(true);
      const bal = await celoService.getG$Balance(addr);
      setGDollarBalance(bal);

      // Load or migrate profile
      const walletPlayer = await dbService.getPlayer(addr);
      if (walletPlayer) {
        setPlayerData(walletPlayer);
      } else if (playerData && playerData.wallet_address === 'local_player') {
        const migrated = { ...playerData, wallet_address: addr };
        await dbService.savePlayer(migrated);
        setPlayerData(migrated);
      }
    } catch (e) {
      alert('Wallet connection failed. Running in offline/mock mode.');
    }
  };

  const refreshBalance = async () => {
    if (!walletAddress) return;
    try {
      const bal = await celoService.getG$Balance(walletAddress);
      setGDollarBalance(bal);
    } catch (e) {
      console.error(e);
    }
  };

  const createCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!charName.trim()) return;

    // Define initial stats based on class
    let stats = { strength: 10, agility: 10, defense: 10, vitality: 10 };
    let maxHp = 100;

    if (selectedClass === 'knight') {
      stats = { strength: 12, agility: 8, defense: 12, vitality: 12 };
      maxHp = 130;
    } else if (selectedClass === 'ranger') {
      stats = { strength: 10, agility: 15, defense: 8, vitality: 10 };
      maxHp = 100;
    } else if (selectedClass === 'berserker') {
      stats = { strength: 16, agility: 6, defense: 10, vitality: 14 };
      maxHp = 160;
    }

    const newPlayer = {
      wallet_address: walletAddress || 'local_player',
      name: charName.trim(),
      class: selectedClass,
      level: 1,
      xp: 0,
      gold: 100, // starting gold
      maxHp,
      hp: maxHp,
      stats,
      statPoints: 0,
      maxUnlockedZone: 1, // Start with Level 1 unlocked
      equippedWeapon: 'bamboo_stick',
      arsenal: ['bamboo_stick'],
      inventory: [],
      ubiBuffActive: false,
      ubiBuffExpiresAt: null
    };

    setLoading(true);
    try {
      const saved = await dbService.savePlayer(newPlayer);
      setPlayerData(saved);
    } catch (err) {
      console.error('Failed to create character:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1E201E] text-zinc-300 font-mono">
        <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4" />
        <span>Loading Fable Character Profile...</span>
      </div>
    );
  }

  // 1. Character Creation Page
  if (!playerData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1E201E] px-4 py-8 font-mono text-zinc-200">
        <div className="w-full max-w-md bg-zinc-950/80 border border-zinc-800 rounded-2xl p-6 backdrop-blur-md shadow-2xl flex flex-col gap-6">
          <div className="text-center flex flex-col items-center">
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-amber-600 tracking-wider">
              FABLE RPG
            </h1>
            <p className="text-xs text-zinc-500 mt-1 uppercase tracking-widest">
              Volcanic Action RPG on Celo
            </p>
          </div>

          <form onSubmit={createCharacter} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Hero's Name</label>
              <input
                type="text"
                placeholder="Enter Name..."
                value={charName}
                onChange={e => setCharName(e.target.value)}
                maxLength={12}
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-yellow-600 focus:outline-none px-4 py-2.5 rounded-lg text-sm font-semibold text-zinc-100 transition-colors"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Choose Class</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'knight', name: 'Knight', color: 'border-emerald-700 bg-emerald-950/20' },
                  { id: 'ranger', name: 'Ranger', color: 'border-sky-700 bg-sky-950/20' },
                  { id: 'berserker', name: 'Berserker', color: 'border-red-700 bg-red-950/20' }
                ].map(cls => {
                  const selected = selectedClass === cls.id;
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => setSelectedClass(cls.id as any)}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 text-xs font-bold transition-all relative ${selected ? cls.color + ' border-yellow-500 scale-105' : 'border-zinc-800 hover:border-zinc-700'}`}
                    >
                      {selected && <Check size={12} className="absolute top-1 right-1 text-yellow-500" />}
                      <span>{cls.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Class Stats Preview */}
            <div className="bg-zinc-900/50 border border-zinc-800/80 p-3 rounded-lg flex flex-col gap-2 text-xs text-zinc-400">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Starting Attributes</span>
              {selectedClass === 'knight' && (
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <span>❤️ Max HP: <b className="text-zinc-200">130</b></span>
                  <span>🛡️ Defense: <b className="text-zinc-200">12</b></span>
                  <span>⚔️ Strength: <b className="text-zinc-200">12</b></span>
                  <span>⚡ Agility: <b className="text-zinc-200">8</b></span>
                </div>
              )}
              {selectedClass === 'ranger' && (
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <span>❤️ Max HP: <b className="text-zinc-200">100</b></span>
                  <span>🛡️ Defense: <b className="text-zinc-200">8</b></span>
                  <span>⚔️ Strength: <b className="text-zinc-200">10</b></span>
                  <span>⚡ Agility: <b className="text-zinc-200">15</b></span>
                </div>
              )}
              {selectedClass === 'berserker' && (
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <span>❤️ Max HP: <b className="text-zinc-200">160</b></span>
                  <span>🛡️ Defense: <b className="text-zinc-200">10</b></span>
                  <span>⚔️ Strength: <b className="text-zinc-200">16</b></span>
                  <span>⚡ Agility: <b className="text-zinc-200">6</b></span>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black py-3 rounded-xl text-sm font-extrabold tracking-wider mt-2 shadow-lg shadow-amber-900/20 active:scale-95 transition-all"
            >
              CREATE HERO
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. Main Game Screen Layout
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#111111] px-0 md:px-4">
      {/* Responsive wrapper: narrow on mobile portrait, full-width on desktop landscape */}
      <div className="relative w-full max-w-[480px] md:max-w-4xl lg:max-w-6xl xl:max-w-7xl bg-zinc-950 md:rounded-2xl border-0 md:border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Game Canvas */}
        <GameContainer playerData={playerData} />

        {/* HUD overlay */}
        <HUD
          playerData={playerData}
          setPlayerData={setPlayerData}
          walletConnected={walletConnected}
          walletAddress={walletAddress}
          connectWallet={connectWallet}
          gDollarBalance={gDollarBalance}
          refreshBalance={refreshBalance}
        />
      </div>
    </div>
  );
}
