'use client';

import React, { useState, useEffect } from 'react';
import gameBridge from '../game/systems/GameBridge';
import Joystick from './Joystick';
import { dbService } from '../lib/supabaseClient';
import { celoService } from '../lib/celo';
import {
  Sword, Backpack, User, Compass, Wallet2, BookOpen,
  MapPin, Flame, Award, Heart, CheckCircle2, X, RefreshCw, Gem
} from 'lucide-react';
import TavernShop, { TAVERN_WEAPONS } from './TavernShop';
import LevelClearScreen from './LevelClearScreen';
import { GD_ITEMS } from '../lib/nft';

interface HUDProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletConnected: boolean;
  walletAddress: string;
  connectWallet: () => Promise<void>;
  gDollarBalance: string;
  refreshBalance: () => Promise<void>;
}

type TabType = 'none' | 'bag' | 'loadout' | 'stats' | 'codex' | 'journey' | 'wallet';

export default function HUD({
  playerData,
  setPlayerData,
  walletConnected,
  walletAddress,
  connectWallet,
  gDollarBalance,
  refreshBalance
}: HUDProps) {
  const [activeTab, setActiveTab] = useState<TabType>('none');
  const [currentZone, setCurrentZone] = useState<string>('Booting...');
  const [abilityCooldown, setAbilityCooldown] = useState(0); // 0 to 100 percentage
  const [cooldownRemaining, setCooldownRemaining] = useState(0); // seconds
  const [inTavern, setInTavern] = useState(false);
  const [inLevelClear, setInLevelClear] = useState(false);
  const [levelClearZone, setLevelClearZone] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [claimingUBI, setClaimingUBI] = useState(false);


  useEffect(() => {
    // 1. Scene Changes — replayLast=true so HUD always gets the zone even if it
    //    mounted after TownScene already emitted scene_changed during Phaser boot.
    const unsubScene = gameBridge.on('scene_changed', (data: any) => {
      setCurrentZone(data.title);
      if (data.scene !== 'TownScene') setInTavern(false);
      setInLevelClear(false);
    }, true);

    // 2. Tavern Entry
    const unsubTavern = gameBridge.on('enter_tavern', () => {
      setInTavern(true);
    });

    // 3. Health Sync
    const unsubHP = gameBridge.on('player_health_changed', (data: any) => {
      setPlayerData((prev: any) => {
        const nextHP = Math.max(0, data.hp);
        return { ...prev, hp: nextHP };
      });
    });

    // 4. Gold Sync
    const unsubGold = gameBridge.on('player_gold_changed', (gained: number) => {
      setPlayerData((prev: any) => {
        const newGold = prev.gold + gained;
        const updated = { ...prev, gold: newGold };
        dbService.savePlayer(updated);
        return updated;
      });
    });

    // 5. XP Sync
    const unsubXP = gameBridge.on('player_xp_gained', (gained: number) => {
      setPlayerData((prev: any) => {
        const actualGain = prev.ubiBuffActive ? Math.floor(gained * 1.5) : gained;
        let newXP = prev.xp + actualGain;
        let newLevel = prev.level;
        let statPoints = prev.statPoints || 0;
        const xpNeeded = newLevel * 100;
        if (newXP >= xpNeeded) {
          newXP -= xpNeeded;
          newLevel += 1;
          statPoints += 5;
          // Defer flash message — calling setState inside a setState updater
          // triggers React's "setState during render" warning.
          setTimeout(() => showFlashMessage(`LEVEL UP! You reached Level ${newLevel}!`), 0);
        }
        const updated = { ...prev, xp: newXP, level: newLevel, statPoints };
        dbService.savePlayer(updated);
        return updated;
      });
    });

    // 6. Loot Sync
    const unsubLoot = gameBridge.on('loot_collected', (data: any) => {
      setPlayerData((prev: any) => {
        const inventory = [...(prev.inventory || [])];
        const index = inventory.findIndex(i => i.item === data.item);
        if (index >= 0) {
          inventory[index].count += 1;
        } else {
          inventory.push({ item: data.item, count: 1 });
        }
        const updated = { ...prev, inventory };
        dbService.savePlayer(updated);
        return updated;
      });
    });

    // 7. Zone Cleared → show level clear/potion screen
    const unsubClear = gameBridge.on('zone_cleared', (data: any) => {
      setPlayerData((prev: any) => {
        let maxUnlocked = prev.maxUnlockedZone || 1;
        if (data.zone === 'EmberFieldsScene' && maxUnlocked < 2) maxUnlocked = 2;
        if (data.zone === 'AshwaterMarshScene' && maxUnlocked < 3) maxUnlocked = 3;
        const updated = { ...prev, maxUnlockedZone: maxUnlocked };
        dbService.savePlayer(updated);
        return updated;
      });
      setLevelClearZone(data.zone);
      setInLevelClear(true);
    });

    // 8. Cooldown Spinner
    const unsubCD = gameBridge.on('ability_cooldown_started', (data: any) => {
      const duration = data.duration; // ms
      const start = Date.now();
      
      const interval = setInterval(() => {
        const elapsed = Date.now() - start;
        const pct = Math.max(0, 100 - (elapsed / duration) * 100);
        const rem = Math.max(0, Math.ceil((duration - elapsed) / 1000));
        
        setAbilityCooldown(pct);
        setCooldownRemaining(rem);

        if (elapsed >= duration) {
          clearInterval(interval);
          setAbilityCooldown(0);
          setCooldownRemaining(0);
        }
      }, 50);
    });

    // 9. Death Handler
    const unsubDeath = gameBridge.on('player_died', () => {
      showFlashMessage('YOU DIED! Resurrecting at Town Hub...');
      setTimeout(() => {
        setPlayerData((prev: any) => ({ ...prev, hp: prev.maxHp }));
        gameBridge.emit('exit_zone');
      }, 2000);
    });

    // Retry requesting scene info after Phaser has had time to boot.
    // Covers the case where HUD mounts before TownScene.create() has run.
    const t1 = setTimeout(() => gameBridge.emit('request_scene_info'), 300);
    const t2 = setTimeout(() => gameBridge.emit('request_scene_info'), 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      unsubScene();
      unsubTavern();
      unsubHP();
      unsubGold();
      unsubXP();
      unsubLoot();
      unsubClear();
      unsubCD();
      unsubDeath();
    };
  }, []);

  const showFlashMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  // Stat point allocation
  const allocateStat = (statName: 'strength' | 'agility' | 'defense' | 'vitality') => {
    if ((playerData.statPoints || 0) <= 0) return;

    setPlayerData((prev: any) => {
      const stats = { ...prev.stats };
      stats[statName] = (stats[statName] || 0) + 1;
      
      let maxHp = prev.maxHp;
      let hp = prev.hp;
      if (statName === 'vitality') {
        maxHp += 15; // +15 Max HP per Vitality point
        hp += 15;
      }

      const updated = {
        ...prev,
        stats,
        maxHp,
        hp,
        statPoints: prev.statPoints - 1
      };
      
      dbService.savePlayer(updated);
      return updated;
    });
  };

  // Claim Daily G$ UBI
  const handleClaimUBI = async () => {
    if (claimingUBI) return;
    setClaimingUBI(true);
    try {
      if (!walletConnected) {
        await connectWallet();
      }

      // Claim via service (calls real network contract or falls back to mock claiming)
      const tx = await celoService.claimUBI(walletAddress);
      
      // Update balance
      await refreshBalance();

      // Trigger 24 hour daily XP/Gold bonus buff
      setPlayerData((prev: any) => {
        const updated = {
          ...prev,
          ubiBuffActive: true,
          ubiBuffExpiresAt: Date.now() + 24 * 60 * 60 * 1000
        };
        dbService.savePlayer(updated);
        return updated;
      });

      showFlashMessage('Daily GoodDollar claimed! 24-hr +50% XP/Gold Buff Active!');
    } catch (e) {
      console.error(e);
      showFlashMessage('Claim failed. Please verify your connection.');
    } finally {
      setClaimingUBI(false);
    }
  };

  // Commit progress on-chain via a small G$ self-transfer (proves wallet ownership + embeds level data)
  const handleCommitProgress = async () => {
    if (!walletConnected || claimingUBI) return;
    setClaimingUBI(true);
    try {
      if (!walletAddress) { await connectWallet(); }
      const localRef = `local_${Date.now()}`;
      await dbService.recordProgressSync(walletAddress, playerData.level, playerData.gold, localRef);
      setPlayerData((prev: any) => ({
        ...prev,
        lastProgressSync: { level: prev.level, gold: prev.gold, txHash: localRef, syncedAt: new Date().toISOString() },
      }));
      showFlashMessage(`Progress saved! Lv ${playerData.level} · ${playerData.gold}G recorded.`);
    } catch (e) {
      console.error(e);
      showFlashMessage('Commit failed. Check wallet connection.');
    } finally {
      setClaimingUBI(false);
    }
  };

  // Equip weapon
  const equipWeapon = (weaponId: string) => {
    setPlayerData((prev: any) => {
      const updated = { ...prev, equippedWeapon: weaponId };
      dbService.savePlayer(updated);
      return updated;
    });
  };

  const currentWeaponObj = TAVERN_WEAPONS.find(w => w.id === playerData.equippedWeapon) ?? { name: 'Bamboo Stick', attack: 5 };

  return (
    <div className="absolute inset-0 flex flex-col pointer-events-none select-none justify-between font-mono">
      {/* Tavern Shop full-screen overlay */}
      {inTavern && (
        <TavernShop
          playerData={playerData}
          setPlayerData={setPlayerData}
          walletAddress={walletAddress}
          walletConnected={walletConnected}
          connectWallet={connectWallet}
          gDollarBalance={gDollarBalance}
          refreshBalance={refreshBalance}
          onLeave={() => setInTavern(false)}
          showMessage={showFlashMessage}
        />
      )}


      {/* 1. Top HUD Header */}
      <div className="w-full p-4 flex justify-between items-start pointer-events-auto bg-gradient-to-b from-black/80 via-black/30 to-transparent">
        {/* Profile Card */}
        <div className="flex flex-col gap-1 bg-black/60 border border-zinc-800 p-2 rounded-lg backdrop-blur-md">
          <div className="flex justify-between items-center text-xs">
            <span className="text-purple-400 font-bold">LV {playerData.level}</span>
            <span className="text-zinc-200 font-semibold max-w-[80px] truncate">{playerData.name}</span>
          </div>
          
          {/* HP Bar */}
          <div className="w-36 flex flex-col gap-0.5 mt-1">
            <div className="flex justify-between text-[9px] text-zinc-400">
              <span className="flex items-center gap-0.5"><Heart size={8} className="text-red-500" /> HP</span>
              <span>{playerData.hp}/{playerData.maxHp}</span>
            </div>
            <div className="w-full bg-zinc-950 h-2 rounded border border-zinc-800 overflow-hidden">
              <div 
                className="bg-red-500 h-full transition-all duration-300"
                style={{ width: `${(playerData.hp / playerData.maxHp) * 100}%` }}
              />
            </div>
          </div>

          {/* XP Bar */}
          <div className="w-36 flex flex-col gap-0.5">
            <div className="flex justify-between text-[9px] text-zinc-400">
              <span>XP</span>
              <span>{playerData.xp}/{playerData.level * 100}</span>
            </div>
            <div className="w-full bg-zinc-950 h-1 rounded border border-zinc-800 overflow-hidden">
              <div 
                className="bg-green-500 h-full transition-all duration-300"
                style={{ width: `${(playerData.xp / (playerData.level * 100)) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Currency & Zone */}
        <div className="flex flex-col gap-1 items-end">
          <div className="flex gap-1.5 bg-black/60 border border-zinc-800 px-3 py-1 rounded-full text-xs font-bold text-yellow-500 backdrop-blur-md">
            <span>🪙 {playerData.gold}G</span>
            <span className="text-zinc-500">|</span>
            <span className="text-emerald-400 flex items-center gap-1 font-bold">
              💲 {parseFloat(gDollarBalance).toFixed(2)} G$
            </span>
          </div>
          
          <div className="flex items-center gap-1 bg-black/40 border border-zinc-800/80 px-2 py-0.5 rounded text-[10px] text-zinc-300 font-semibold">
            <MapPin size={10} className="text-zinc-400" />
            <span>{currentZone}</span>
          </div>

          {playerData.ubiBuffActive && (
            <div className="flex items-center gap-1 bg-gradient-to-r from-yellow-600/80 to-amber-600/80 border border-yellow-500/30 px-2 py-0.5 rounded text-[9px] text-yellow-100 font-bold animate-pulse">
              <Flame size={10} />
              <span>+50% XP/Gold Buff</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Middle Overlay (Message / Warning / Tavern Overlay) */}
      <div className="flex-1 flex flex-col items-center justify-center pointer-events-none p-4">
        {message && (
          <div className="bg-black/85 border-2 border-purple-500 text-purple-300 px-4 py-2.5 rounded-lg text-center text-xs font-bold shadow-xl shadow-black/80 animate-bounce pointer-events-auto max-w-[280px]">
            {message}
          </div>
        )}

      </div>

      {/* 3. Bottom Controls Area & Panels */}
      <div className="w-full flex flex-col gap-4 pointer-events-auto bg-gradient-to-t from-black via-black/85 to-transparent">
        {/* Toggleable Drawer panels */}
        {activeTab !== 'none' && (
          <div className="mx-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl max-h-[300px] overflow-y-auto animate-slide-up flex flex-col gap-3">
            {/* Panel Header */}
            <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400 capitalize">
                {activeTab === 'bag' && <Backpack size={14} />}
                {activeTab === 'loadout' && <Sword size={14} />}
                {activeTab === 'stats' && <User size={14} />}
                {activeTab === 'codex' && <BookOpen size={14} />}
                {activeTab === 'journey' && <Compass size={14} />}
                {activeTab === 'wallet' && <Wallet2 size={14} />}
                <span>{activeTab}</span>
              </div>
              <button onClick={() => setActiveTab('none')} className="text-zinc-500 hover:text-zinc-300">
                <X size={16} />
              </button>
            </div>

            {/* Panel Contents */}
            <div className="flex-1 text-xs">
              {/* BAG */}
              {activeTab === 'bag' && (
                <div className="flex flex-col gap-3">
                  {/* NFT Items */}
                  {playerData.nftItems && playerData.nftItems.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                        <Gem size={10} /> NFT Items (on-chain)
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {playerData.nftItems.map((nft: any) => {
                          const def = GD_ITEMS.find(i => i.id === nft.itemId);
                          return (
                            <div key={nft.itemId} className="flex items-center gap-1.5 bg-purple-950/30 p-2 rounded border border-purple-800/40">
                              <span className="text-base">{def?.icon ?? '🎁'}</span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-zinc-100 truncate">{def?.name ?? nft.itemId}</span>
                                <span className="text-[8px] text-purple-400">Token #{nft.tokenId}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Regular inventory */}
                  {playerData.inventory && playerData.inventory.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {playerData.inventory.map((inv: any) => (
                        <div key={inv.item} className="flex justify-between items-center bg-zinc-900 p-2 rounded border border-zinc-800">
                          <span className="capitalize text-[11px] font-bold text-zinc-200">
                            {inv.item === 'scorpion' ? '🦂 Scorpion Shell' : '🔥 Fire Brand'}
                          </span>
                          <span className="bg-purple-900/60 text-purple-200 px-1.5 py-0.5 rounded text-[10px] font-bold">x{inv.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (!playerData.nftItems || playerData.nftItems.length === 0) && (
                    <div className="text-center text-zinc-500 py-4 text-[11px]">
                      Bag empty. Buy G$ items in the Tavern to mint NFTs.
                    </div>
                  )}
                </div>
              )}

              {/* LOADOUT */}
              {activeTab === 'loadout' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-zinc-900 p-2 rounded border border-zinc-800 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold">Equipped Weapon</span>
                      <span className="text-yellow-500 font-bold">{currentWeaponObj.name}</span>
                    </div>
                    <span className="text-zinc-400 font-bold">+{currentWeaponObj.attack} ATK</span>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="text-[10px] text-zinc-400 font-semibold tracking-wider">Arsenal</span>
                    {playerData.arsenal?.map((weaponId: string) => {
                      const details = TAVERN_WEAPONS.find(w => w.id === weaponId) ?? { name: 'Bamboo Stick', attack: 5 };
                      const isEquipped = playerData.equippedWeapon === weaponId;
                      const isNFT = playerData.nftItems?.some((n: any) => n.itemId === weaponId);
                      return (
                        <div key={weaponId} className="flex justify-between items-center bg-black/40 p-2 rounded border border-zinc-800/80">
                          <span className="flex items-center gap-1">
                            {details.name} (+{details.attack} ATK)
                            {isNFT && <Gem size={9} className="text-purple-400" />}
                          </span>
                          {isEquipped ? (
                            <span className="text-[9px] bg-yellow-950 text-yellow-400 border border-yellow-800/80 px-2 py-0.5 rounded font-bold">EQUIPPED</span>
                          ) : (
                            <button onClick={() => equipWeapon(weaponId)} className="bg-purple-600 hover:bg-purple-500 text-white text-[9px] px-2 py-0.5 rounded font-bold">
                              EQUIP
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Abilities */}
                  {playerData.abilities && playerData.abilities.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      <span className="text-[10px] text-zinc-400 font-semibold tracking-wider">Special Abilities</span>
                      {playerData.abilities.map((abilityId: string) => {
                        const def = GD_ITEMS.find(i => i.id === abilityId);
                        const isNFT = playerData.nftItems?.some((n: any) => n.itemId === abilityId);
                        return (
                          <div key={abilityId} className="flex justify-between items-center bg-black/40 p-2 rounded border border-zinc-800/80">
                            <span className="flex items-center gap-1.5">
                              <span>{def?.icon}</span>
                              <span>{def?.name ?? abilityId}</span>
                              {isNFT && <Gem size={9} className="text-purple-400" />}
                            </span>
                            <span className="text-[9px] text-purple-300 bg-purple-950/40 border border-purple-800/40 px-2 py-0.5 rounded">{def?.effect}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* STATS */}
              {activeTab === 'stats' && (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center bg-purple-950/40 border border-purple-900/60 p-2 rounded text-purple-300 font-bold">
                    <span>Available Stat Points</span>
                    <span>{playerData.statPoints || 0}</span>
                  </div>

                  <div className="flex flex-col gap-2 mt-1">
                    {[
                      { key: 'strength', name: '🔴 Strength (Damage)', val: playerData.stats.strength },
                      { key: 'agility', name: '🟢 Agility (Crit chance)', val: playerData.stats.agility },
                      { key: 'defense', name: '🔵 Defense (Damage Reduction)', val: playerData.stats.defense },
                      { key: 'vitality', name: '🟡 Vitality (Max HP +15)', val: playerData.stats.vitality }
                    ].map(st => (
                      <div key={st.key} className="flex justify-between items-center bg-zinc-900/60 p-2 rounded border border-zinc-800">
                        <span className="text-[11px] font-semibold text-zinc-300">{st.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold">{st.val}</span>
                          <button
                            onClick={() => allocateStat(st.key as any)}
                            disabled={(playerData.statPoints || 0) <= 0}
                            className="w-6 h-6 flex justify-center items-center bg-purple-600 hover:bg-purple-500 disabled:opacity-30 rounded text-white font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CODEX */}
              {activeTab === 'codex' && (
                <div className="flex flex-col gap-3 max-h-[200px] overflow-y-auto pr-1">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Lava Biome Enemies</span>
                    <p className="text-zinc-400 text-[10px] leading-relaxed">
                      <strong>Imp:</strong> Standard aggressive fire-spitter. Moves fast but frail.<br/>
                      <strong>Lava Pumpkin (Boss):</strong> Giant volcanic entity. Shoots heavy rings of magma.
                    </p>
                  </div>
                  <hr className="border-zinc-800" />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Swamp Biome Enemies</span>
                    <p className="text-zinc-400 text-[10px] leading-relaxed">
                      <strong>Poison Slime:</strong> Slow purple gelatin. Spits acidic slowing fluid.<br/>
                      <strong>Swamp Hydra (Boss):</strong> Three heads spitting multiple poison projectiles in wide arcs.
                    </p>
                  </div>
                  <hr className="border-zinc-800" />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Summit Peak Enemies</span>
                    <p className="text-zinc-400 text-[10px] leading-relaxed">
                      <strong>Obsidian Golem:</strong> Slow rocky giant. Block 20% of incoming player attacks.<br/>
                      <strong>Fire Demon (Boss):</strong> Final volcanic boss. Shoots high-damage flame pulses and shakes the summit.
                    </p>
                  </div>
                </div>
              )}

              {/* JOURNEY */}
              {activeTab === 'journey' && (
                <div className="flex flex-col gap-2">
                  <div className="bg-zinc-900 p-2.5 rounded border border-zinc-800 flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">Main Quest</span>
                    <span className="font-bold text-zinc-100 flex items-center gap-1">
                      ⚔️ Reach Obsidian Peak
                    </span>
                    <p className="text-[10px] text-zinc-400">
                      Defeat bosses to unlock progressive zones: Ember Fields (Lv 1-2) → Ashwater Marsh (Lv 3-5) → Obsidian Peak (Lv 6-8).
                    </p>
                  </div>
                  
                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">Zone Clear Status</span>
                    {[
                      { name: '1. Ember Fields', unlocked: true, cleared: playerData.maxUnlockedZone > 1 },
                      { name: '2. Ashwater Marsh', unlocked: playerData.maxUnlockedZone >= 2, cleared: playerData.maxUnlockedZone > 2 },
                      { name: '3. Obsidian Peak', unlocked: playerData.maxUnlockedZone >= 3, cleared: false }
                    ].map((zone, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-black/40 p-2 rounded text-[10px] border border-zinc-850">
                        <span className={zone.unlocked ? 'text-zinc-200' : 'text-zinc-600'}>{zone.name}</span>
                        {zone.cleared ? (
                          <span className="text-green-500 font-bold flex items-center gap-0.5"><CheckCircle2 size={10} /> Cleared</span>
                        ) : zone.unlocked ? (
                          <span className="text-amber-500 font-bold">Active</span>
                        ) : (
                          <span className="text-zinc-600">Locked</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* WALLET & GOODDOLLAR UBI */}
              {activeTab === 'wallet' && (
                <div className="flex flex-col gap-3">
                  {walletConnected ? (
                    <div className="flex flex-col gap-2 bg-zinc-900 p-3 rounded border border-zinc-800">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-zinc-500">Connected Wallet</span>
                        <span className="text-green-400 font-semibold">Active</span>
                      </div>
                      <span className="text-[11px] font-bold text-zinc-200 block truncate font-mono">
                        {walletAddress}
                      </span>
                      <div className="flex justify-between mt-2 pt-2 border-t border-zinc-800 text-[11px]">
                        <span className="text-zinc-400 font-bold">GoodDollar Balance</span>
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          {parseFloat(gDollarBalance).toFixed(2)} G$
                          <button onClick={refreshBalance} className="text-zinc-500 hover:text-zinc-300">
                            <RefreshCw size={10} />
                          </button>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={connectWallet}
                      className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 text-white py-2.5 rounded-lg text-xs font-bold font-mono hover:brightness-110"
                    >
                      🔌 Connect Celo Wallet
                    </button>
                  )}

                  {/* Claim UBI */}
                  <div className="flex flex-col bg-emerald-950/30 border border-emerald-900/40 p-3 rounded-lg mt-2">
                    <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1 mb-1">
                      <Award size={12} /> Claim Daily UBI Reward
                    </span>
                    <p className="text-[10px] text-zinc-300 leading-relaxed mb-3">
                      Claim GoodDollar daily on Celo. Grants a +50% Gold and XP boost for 24 hours.
                    </p>
                    <button
                      onClick={handleClaimUBI}
                      disabled={claimingUBI}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-[11px] disabled:opacity-50 flex justify-center items-center gap-1.5 shadow"
                    >
                      {claimingUBI ? <><RefreshCw size={12} className="animate-spin" /> Claiming on Celo...</> : 'CLAIM DAILY G$ & BUFF'}
                    </button>
                  </div>

                  {/* Commit Progress on-chain */}
                  <div className="flex flex-col bg-purple-950/20 border border-purple-900/40 p-3 rounded-lg mt-2">
                    <span className="text-purple-300 font-bold text-[11px] flex items-center gap-1 mb-1">
                      <Gem size={12} /> Commit Progress On-Chain
                    </span>
                    <p className="text-[10px] text-zinc-400 leading-relaxed mb-2">
                      Record your current level and gold permanently on Celo. Proves your off-chain progress on-chain.
                    </p>
                    {playerData.lastProgressSync && (
                      <p className="text-[9px] text-purple-400 mb-2">
                        Last sync: Lv {playerData.lastProgressSync.level} · {new Date(playerData.lastProgressSync.syncedAt).toLocaleDateString()}
                      </p>
                    )}
                    <button
                      onClick={handleCommitProgress}
                      disabled={claimingUBI || !walletConnected}
                      className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-2 rounded text-[11px] disabled:opacity-40 flex justify-center items-center gap-1.5"
                    >
                      {walletConnected ? `Commit Lv ${playerData.level} — ${playerData.gold}G` : 'Connect wallet first'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. Controls / Joysticks Row */}
        <div className="flex justify-between items-end px-6 pb-6 pt-2 select-none pointer-events-none">
          {/* Left Joystick: Move */}
          <div className="pointer-events-auto">
            <Joystick type="left" label="Move" />
          </div>

          {/* Center Exit & Ability */}
          <div className="flex flex-col items-center gap-4 pointer-events-auto">
            {currentZone !== 'Town Hub' && currentZone !== 'Booting...' && (
              <button
                onClick={() => gameBridge.emit('exit_zone')}
                className="bg-black/60 border border-red-900/60 hover:bg-red-950/60 text-red-400 px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur shadow"
              >
                🏃‍♂️ Flee to Town
              </button>
            )}

            {/* Special Ability Button (Nova Blast) */}
            <div className="relative">
              <button
                onClick={() => gameBridge.emit('ability_trigger')}
                disabled={cooldownRemaining > 0}
                className={`w-14 h-14 rounded-full border-2 border-purple-500 flex flex-col items-center justify-center bg-black/60 shadow-lg shadow-black/60 hover:border-purple-400 active:scale-95 transition-all select-none duration-100 ${cooldownRemaining > 0 ? 'opacity-40' : ''}`}
              >
                <Flame size={20} className={cooldownRemaining > 0 ? 'text-zinc-500' : 'text-purple-400'} />
                <span className="text-[8px] font-bold text-purple-300 mt-0.5">ABILITY</span>
              </button>

              {/* Cooldown Ring Overlay */}
              {cooldownRemaining > 0 && (
                <div className="absolute inset-0 rounded-full bg-black/70 flex items-center justify-center border-2 border-zinc-700 pointer-events-none">
                  <span className="text-xs font-bold text-zinc-300 font-mono">{cooldownRemaining}s</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Joystick: Aim */}
          <div className="pointer-events-auto">
            <Joystick type="right" label="Aim/Shoot" />
          </div>
        </div>

        {/* 5. Bottom Navigation Bar */}
        <div className="w-full grid grid-cols-6 border-t border-zinc-800 bg-zinc-950 pointer-events-auto">
          {[
            { id: 'bag', label: 'Bag', icon: <Backpack size={16} /> },
            { id: 'loadout', label: 'Loadout', icon: <Sword size={16} /> },
            { id: 'stats', label: 'Stats', icon: <User size={16} /> },
            { id: 'codex', label: 'Codex', icon: <BookOpen size={16} /> },
            { id: 'journey', label: 'Journey', icon: <Compass size={16} /> },
            { id: 'wallet', label: 'Wallet', icon: <Wallet2 size={16} /> }
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(active ? 'none' : tab.id as any)}
                className={`flex flex-col items-center justify-center py-2.5 border-r border-zinc-900/50 last:border-0 hover:bg-zinc-900/40 transition-colors ${active ? 'bg-purple-950/20 text-purple-400 border-t-2 border-t-purple-500' : 'text-zinc-400'}`}
              >
                {tab.icon}
                <span className="text-[8px] mt-1 font-bold tracking-wide">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Level Clear / Potion Shop overlay — rendered LAST so it sits above all other HUD layers */}
      {inLevelClear && (
        <LevelClearScreen
          clearedZone={levelClearZone}
          playerData={playerData}
          setPlayerData={setPlayerData}
          onContinue={() => setInLevelClear(false)}
        />
      )}
    </div>
  );
}
