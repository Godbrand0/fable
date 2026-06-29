'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { dbService } from '../lib/supabaseClient';
import { celoService } from '../lib/celo';
import HUD from '../components/HUD';
import { Check, Wallet2, User, Loader2, AlertTriangle } from 'lucide-react';

const GameContainer = dynamic(() => import('../components/GameContainer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center w-full h-[60vh] bg-zinc-950 text-zinc-400 font-mono gap-3">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <span>Loading Fable Game Engine...</span>
    </div>
  ),
});

type Phase = 'splash' | 'auth' | 'creating' | 'playing';
type AuthTab = 'wallet' | 'username';

export default function Home() {
  const [phase, setPhase]         = useState<Phase>('splash');
  const [progress, setProgress]   = useState(0);
  const [splashFade, setSplashFade] = useState(false);

  const [playerData, setPlayerData]   = useState<any>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress]     = useState('');
  const [gDollarBalance, setGDollarBalance]   = useState('0.00');

  // Auth screen state
  const [authTab, setAuthTab]       = useState<AuthTab>('wallet');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError]   = useState('');
  const [usernameInput, setUsernameInput] = useState('');

  // Character creation state
  const [charName, setCharName]     = useState('');
  const [selectedClass, setSelectedClass] = useState<'knight' | 'ranger' | 'berserker'>('knight');
  const [creating, setCreating]     = useState(false);

  // Splash: 10s progress bar → auth screen
  useEffect(() => {
    const DURATION = 10000;
    const INTERVAL = 80;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += INTERVAL;
      setProgress(Math.min(100, (elapsed / DURATION) * 100));
      if (elapsed >= DURATION) {
        clearInterval(timer);
        setSplashFade(true);
        setTimeout(() => setPhase('auth'), 600);
      }
    }, INTERVAL);
    return () => clearInterval(timer);
  }, []);

  const refreshBalance = async (addr?: string) => {
    const target = addr || walletAddress;
    if (!target) return;
    try {
      const bal = await celoService.getG$Balance(target);
      setGDollarBalance(bal);
    } catch { /* ignore */ }
  };

  // ── WALLET SIGN-IN ──────────────────────────────────────────────────────────
  const handleWalletSignIn = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const addr = await celoService.connectWallet();
      setWalletAddress(addr);
      setWalletConnected(true);
      refreshBalance(addr);

      // DB-only check — localStorage must not bypass character creation
      const existing = await dbService.getPlayerFromDB(addr);
      if (existing) {
        setPlayerData(existing);
        setPhase('playing');
      } else {
        setPhase('creating');
      }
    } catch {
      setAuthError('Wallet connection failed. Try again or use a username.');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── USERNAME SIGN-IN ────────────────────────────────────────────────────────
  const handleUsernameSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const found = await dbService.getPlayerByName(usernameInput);
      if (found) {
        setPlayerData(found);
        setPhase('playing');
      } else {
        setAuthError('No account found for that username. Please sign in with your wallet first to create a profile.');
      }
    } catch {
      setAuthError('Lookup failed. Check your connection and try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── CHARACTER CREATION (only reached after wallet connect) ──────────────────
  const handleCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!charName.trim() || !walletAddress) return;
    setCreating(true);

    let stats = { strength: 10, agility: 10, defense: 10, vitality: 10 };
    let maxHp = 100;
    if (selectedClass === 'knight')    { stats = { strength: 12, agility: 8,  defense: 12, vitality: 12 }; maxHp = 130; }
    if (selectedClass === 'ranger')    { stats = { strength: 10, agility: 15, defense: 8,  vitality: 10 }; maxHp = 100; }
    if (selectedClass === 'berserker') { stats = { strength: 16, agility: 6,  defense: 10, vitality: 14 }; maxHp = 160; }

    const newPlayer = {
      wallet_address:  walletAddress,
      name:            charName.trim(),
      class:           selectedClass,
      level:           1,
      xp:              0,
      gold:            100,
      maxHp,
      hp:              maxHp,
      stats,
      statPoints:      0,
      maxUnlockedZone: 1,
      equippedWeapon:  'bamboo_stick',
      arsenal:         ['bamboo_stick'],
      abilities:       [],
      inventory:       [],
      nftItems:        [],
      ubiBuffActive:    false,
      ubiBuffExpiresAt: null,
      activeAbility:    null,
      pendingRewards:   [],
    };

    try {
      const saved = await dbService.savePlayer(newPlayer);
      setPlayerData(saved);
      setPhase('playing');
    } catch (err) {
      console.error('Failed to create character:', err);
    } finally {
      setCreating(false);
    }
  };

  // ── SPLASH ──────────────────────────────────────────────────────────────────
  if (phase === 'splash') {
    return (
      <div
        className="fixed inset-0 z-999 flex flex-col items-center justify-center bg-[#0a0a0a] transition-opacity duration-600"
        style={{ opacity: splashFade ? 0 : 1 }}
      >
        <div className="relative w-full max-w-lg px-6">
          <Image src="/banner.png" alt="Fable RPG" width={1024} height={341}
            className="w-full rounded-xl shadow-2xl shadow-amber-900/30" priority />
        </div>
        <div className="mt-6 text-center flex flex-col items-center gap-1">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-yellow-400 to-amber-500 tracking-widest uppercase">
            Fable RPG
          </h1>
          <p className="text-xs text-zinc-500 tracking-widest uppercase">Volcanic Action RPG on Celo</p>
        </div>
        <div className="mt-8 w-full max-w-xs px-6 flex flex-col items-center gap-2">
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-linear-to-r from-yellow-500 to-amber-400 rounded-full transition-none"
              style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] text-zinc-600 font-mono tracking-widest uppercase">
            {progress < 100 ? 'Loading world…' : 'Ready!'}
          </span>
        </div>
      </div>
    );
  }

  // ── AUTH ────────────────────────────────────────────────────────────────────
  if (phase === 'auth') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] px-4 font-mono">
        <div className="w-full max-w-sm flex flex-col gap-6">

          {/* Logo */}
          <div className="text-center flex flex-col items-center gap-1">
            <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-yellow-400 to-amber-500 tracking-widest uppercase">
              Fable RPG
            </h1>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Volcanic Action RPG on Celo</p>
          </div>

          {/* Card */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">

            {/* Tabs */}
            <div className="grid grid-cols-2 border-b border-zinc-800">
              {([['wallet', 'Wallet', Wallet2], ['username', 'Username', User]] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => { setAuthTab(id); setAuthError(''); }}
                  className={`flex items-center justify-center gap-2 py-3.5 text-xs font-bold tracking-wider transition-colors
                    ${authTab === id
                      ? 'bg-zinc-900 text-yellow-400 border-b-2 border-yellow-500'
                      : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <div className="p-5 flex flex-col gap-4">

              {/* WALLET TAB */}
              {authTab === 'wallet' && (
                <div className="flex flex-col gap-4">
                  <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                    Connect your Celo wallet to sign in or create a new hero. Your progress is saved to your address.
                  </p>
                  <button
                    onClick={handleWalletSignIn}
                    disabled={authLoading}
                    className="w-full bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 text-black font-extrabold py-3.5 rounded-xl text-sm tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                  >
                    {authLoading
                      ? <><Loader2 size={15} className="animate-spin" /> Connecting…</>
                      : <><Wallet2 size={15} /> Connect Wallet</>}
                  </button>
                </div>
              )}

              {/* USERNAME TAB */}
              {authTab === 'username' && (
                <form onSubmit={handleUsernameSignIn} className="flex flex-col gap-4">
                  <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                    Enter your hero's name to continue. Only works if you've previously signed in with a wallet.
                  </p>
                  <input
                    type="text"
                    placeholder="Your hero's name…"
                    value={usernameInput}
                    onChange={e => setUsernameInput(e.target.value)}
                    maxLength={12}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-yellow-600 focus:outline-none px-4 py-2.5 rounded-lg text-sm font-semibold text-zinc-100 transition-colors"
                    required
                  />
                  <button
                    type="submit"
                    disabled={authLoading || !usernameInput.trim()}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-extrabold py-3 rounded-xl text-sm tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {authLoading
                      ? <><Loader2 size={15} className="animate-spin" /> Looking up…</>
                      : <><User size={15} /> Continue</>}
                  </button>
                </form>
              )}

              {/* Error */}
              {authError && (
                <div className="flex items-start gap-2 bg-red-950/40 border border-red-800/50 rounded-lg p-3">
                  <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-300 leading-relaxed">{authError}</p>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-[9px] text-zinc-700 uppercase tracking-widest">
            Powered by GoodDollar · Celo Network
          </p>
        </div>
      </div>
    );
  }

  // ── CHARACTER CREATION (wallet connected, no profile yet) ───────────────────
  if (phase === 'creating') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] px-4 py-8 font-mono text-zinc-200">
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-6">

          <div className="text-center flex flex-col items-center gap-1">
            <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-yellow-500 to-amber-600 tracking-wider uppercase">
              Create Your Hero
            </h1>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">New to Fable RPG</p>
          </div>

          {/* Connected wallet badge */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="text-[10px] text-zinc-400 font-mono flex-1 truncate">{walletAddress}</span>
            <span className="text-[9px] text-green-400 font-bold">Connected</span>
          </div>

          <form onSubmit={handleCreateCharacter} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Hero's Name</label>
              <input
                type="text"
                placeholder="Enter Name…"
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
                {([
                  { id: 'knight',    name: 'Knight',    color: 'border-emerald-700 bg-emerald-950/20' },
                  { id: 'ranger',    name: 'Ranger',    color: 'border-sky-700 bg-sky-950/20' },
                  { id: 'berserker', name: 'Berserker', color: 'border-red-700 bg-red-950/20' },
                ] as const).map(cls => {
                  const sel = selectedClass === cls.id;
                  return (
                    <button key={cls.id} type="button" onClick={() => setSelectedClass(cls.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 text-xs font-bold transition-all relative
                        ${sel ? cls.color + ' border-yellow-500 scale-105' : 'border-zinc-800 hover:border-zinc-700'}`}
                    >
                      {sel && <Check size={12} className="absolute top-1 right-1 text-yellow-500" />}
                      {cls.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stats preview */}
            <div className="bg-zinc-900/50 border border-zinc-800/80 p-3 rounded-lg text-xs text-zinc-400 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Starting Attributes</span>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {selectedClass === 'knight'    && <><span>❤️ Max HP: <b className="text-zinc-200">130</b></span><span>🛡️ Defense: <b className="text-zinc-200">12</b></span><span>⚔️ Strength: <b className="text-zinc-200">12</b></span><span>⚡ Agility: <b className="text-zinc-200">8</b></span></>}
                {selectedClass === 'ranger'    && <><span>❤️ Max HP: <b className="text-zinc-200">100</b></span><span>🛡️ Defense: <b className="text-zinc-200">8</b></span><span>⚔️ Strength: <b className="text-zinc-200">10</b></span><span>⚡ Agility: <b className="text-zinc-200">15</b></span></>}
                {selectedClass === 'berserker' && <><span>❤️ Max HP: <b className="text-zinc-200">160</b></span><span>🛡️ Defense: <b className="text-zinc-200">10</b></span><span>⚔️ Strength: <b className="text-zinc-200">16</b></span><span>⚡ Agility: <b className="text-zinc-200">6</b></span></>}
              </div>
            </div>

            <button
              type="submit"
              disabled={creating || !charName.trim()}
              className="w-full bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 text-black py-3 rounded-xl text-sm font-extrabold tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60 shadow-lg shadow-amber-900/20"
            >
              {creating
                ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
                : 'CREATE HERO'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── PLAYING ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#111111] px-0 md:px-4">
      <div className="relative w-full max-w-120 md:max-w-4xl lg:max-w-6xl xl:max-w-7xl bg-zinc-950 md:rounded-2xl border-0 md:border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
        <GameContainer playerData={playerData} />
        <HUD
          playerData={playerData}
          setPlayerData={setPlayerData}
          walletConnected={walletConnected}
          walletAddress={walletAddress}
          connectWallet={handleWalletSignIn}
          gDollarBalance={gDollarBalance}
          refreshBalance={refreshBalance}
        />
      </div>
    </div>
  );
}
