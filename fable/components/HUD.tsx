'use client';

import React, { useState, useEffect } from 'react';
import gameBridge from '../game/systems/GameBridge';
import Joystick from './Joystick';
import { dbService } from '../lib/supabaseClient';
import { celoService } from '../lib/celo';
import {
  Sword, Backpack, User, BookOpen,
  MapPin, Flame, Award, Heart, CheckCircle2, X, RefreshCw, Gem, Wallet2
} from 'lucide-react';
import TavernShop, { TAVERN_WEAPONS } from './TavernShop';
import LevelClearScreen from './LevelClearScreen';
import BankModal from './BankModal';
import DialogueModal from './DialogueModal';
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

type TabType = 'none' | 'bag' | 'loadout' | 'stats' | 'codex' | 'wallet' | 'menu';

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
  const [inBank, setInBank] = useState(false);
  const [inDialogue, setInDialogue] = useState(false);
  const [inLevelClear, setInLevelClear] = useState(false);
  const [levelClearZone, setLevelClearZone] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [claimingUBI, setClaimingUBI] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [showGuideBanner, setShowGuideBanner] = useState(true);


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
    
    // 2.5 Bank Entry
    const unsubBank = gameBridge.on('enter_bank', () => {
      setInBank(true);
    });

    // 2.7 Guide Talk
    const unsubGuide = gameBridge.on('talk_to_guide', () => {
      setInDialogue(true);
    });
    const unsubGuideEnd = gameBridge.on('end_guide_talk', () => {
      setInDialogue(false);
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
      unsubBank();
      unsubGuide();
      unsubGuideEnd();
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

  // Stat upgrade system — gold cost, zone-gated cap
  const totalStatsInvested = (playerData.stats.strength || 0) + (playerData.stats.agility || 0)
    + (playerData.stats.defense || 0) + (playerData.stats.vitality || 0);
  const statCap = (playerData.maxUnlockedZone || 1) * 5;
  const statCost = totalStatsInvested < 5 ? 5 : 10;

  const allocateStat = (statName: 'strength' | 'agility' | 'defense' | 'vitality') => {
    if (totalStatsInvested >= statCap) return;
    if ((playerData.gold || 0) < statCost) return;

    setPlayerData((prev: any) => {
      const stats = { ...prev.stats };
      stats[statName] = (stats[statName] || 0) + 1;

      let maxHp = prev.maxHp;
      let hp = prev.hp;
      if (statName === 'vitality') {
        maxHp += 10;
        hp = Math.min(prev.hp + 10, maxHp);
      }

      const updated = { ...prev, stats, maxHp, hp, gold: prev.gold - statCost };
      dbService.savePlayer(updated);
      return updated;
    });
  };

  // Claim Daily G$ UBI
  const handleClaimUBI = async () => {
    if (claimingUBI) return;
    setClaimingUBI(true);
    try {
      let addr = walletAddress;
      if (!walletConnected || !addr) {
        await connectWallet();
        addr = (await celoService.getConnectedAddress()) ?? '';
      }
      if (!addr) { showFlashMessage('Connect your wallet to claim G$.'); return; }

      // Pre-check GoodDollar identity before attempting on-chain claim
      const verified = await celoService.isGoodDollarVerified(addr);
      if (!verified) {
        showFlashMessage('Identity not verified. Please visit the Town Bank to verify your identity.');
        setClaimingUBI(false);
        return;
      }

      const success = await celoService.claimUBI(addr);
      if (!success) {
        showFlashMessage('Claim failed — transaction did not succeed.');
        return;
      }

      // Only apply buff after confirmed on-chain success
      await refreshBalance();
      setPlayerData((prev: any) => {
        const updated = {
          ...prev,
          ubiBuffActive: true,
          ubiBuffExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };
        dbService.savePlayer(updated);
        return updated;
      });
      showFlashMessage('Daily GoodDollar claimed! 24-hr +50% XP/Gold Buff Active!');
    } catch (e: any) {
      console.error(e);
      if (e?.message?.includes('not whitelisted') || e?.message?.includes('not GoodDollar verified')) {
        showFlashMessage('Not verified. Please verify your identity first.');
      } else {
        showFlashMessage('Claim failed. Please try again.');
      }
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
      
      const wDef = TAVERN_WEAPONS.find(w => w.id === weaponId);
      if (wDef?.textureKey) {
        gameBridge.emit('weapon_changed', { textureKey: wDef.textureKey });
      }

      return updated;
    });
  };

  const equipAbility = (abilityId: string) => {
    setPlayerData((prev: any) => {
      const updated = { ...prev, activeAbility: abilityId };
      dbService.savePlayer(updated);
      return updated;
    });
  };

  const currentWeaponObj = TAVERN_WEAPONS.find(w => w.id === playerData.equippedWeapon) ?? TAVERN_WEAPONS[0];

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

      {/* Bank Modal overlay */}
      {inBank && (
        <BankModal
          playerData={playerData}
          setPlayerData={setPlayerData}
          walletAddress={walletAddress}
          walletConnected={walletConnected}
          connectWallet={connectWallet}
          onClose={() => setInBank(false)}
          refreshBalance={refreshBalance}
          showMessage={showFlashMessage}
        />
      )}

      {/* Dialogue Modal */}
      {inDialogue && (
        <DialogueModal playerName={playerData?.name} />
      )}


      {/* 1. Top HUD Header */}
      <div className="w-full p-4 flex justify-between items-start pointer-events-auto bg-gradient-to-b from-black/80 via-black/30 to-transparent">
        {/* Left: Player Profile & Stats */}
        <div className="flex flex-col gap-1 bg-black/60 border border-zinc-800 p-2 rounded-lg backdrop-blur-md">
          {/* HP Bar */}
          <div className="w-24 flex flex-col gap-0.5 mt-0.5">
            <div className="flex justify-between text-[8px] text-zinc-400 font-bold tracking-wider">
              <span className="flex items-center gap-0.5 text-red-500">HP</span>
              <span>{playerData.hp}/{playerData.maxHp}</span>
            </div>
            <div className="w-full bg-zinc-950 h-1.5 rounded border border-zinc-800 overflow-hidden">
              <div 
                className="bg-red-500 h-full transition-all duration-300"
                style={{ width: `${(playerData.hp / playerData.maxHp) * 100}%` }}
              />
            </div>
          </div>

          {/* XP Bar */}
          <div className="w-24 flex flex-col gap-0.5 mt-1">
            <div className="flex justify-between text-[8px] text-zinc-400 font-bold tracking-wider">
              <span className="text-green-500">XP</span>
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
          
          {playerData.pendingRewards && playerData.pendingRewards.length > 0 && (
            <div className="flex items-center gap-1 bg-gradient-to-r from-green-600/80 to-emerald-600/80 border border-green-500/30 px-2 py-0.5 rounded text-[9px] text-green-100 font-bold animate-pulse">
              <Award size={10} />
              <span>{playerData.pendingRewards.length} Reward{playerData.pendingRewards.length > 1 ? 's' : ''} Pending! Visit Bank</span>
            </div>
          )}

          {/* Guide Banner */}
          {showGuideBanner && currentZone === 'Town Hub' && !inDialogue && !inTavern && !inBank && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-auto bg-blue-950/90 border border-blue-500/50 p-2.5 rounded-lg shadow-2xl flex items-center gap-3 animate-bounce">
              <span className="text-[10px] text-blue-200 font-bold font-mono tracking-widest uppercase">
                Find Guildmaster Thorne in town for a guide!
              </span>
              <button 
                onClick={() => setShowGuideBanner(false)} 
                className="text-blue-400 hover:text-white transition-colors bg-blue-900/50 rounded p-1"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Menu Dropdown Button */}
          <div className="relative mt-1">
            <button
              onClick={() => setActiveTab(activeTab === 'menu' ? 'none' : 'menu')}
              className="bg-zinc-900 border-2 border-zinc-700 px-3 py-1 text-[10px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors shadow-lg active:scale-95"
              style={{ imageRendering: 'pixelated', fontFamily: 'monospace' }}
            >
              MENU {activeTab === 'menu' ? '▲' : '▼'}
            </button>
            
            {activeTab === 'menu' && (
              <div className="absolute top-full right-0 mt-1 flex flex-col bg-zinc-950/95 border border-zinc-700 rounded shadow-xl overflow-hidden min-w-[120px] z-50">
                {[
                  { id: 'bag', label: '🎒 Bag' },
                  { id: 'loadout', label: '🗡️ Loadout' },
                  { id: 'stats', label: '⏳ Stats' },
                  { id: 'codex', label: '📖 Codex' },
                  { id: 'wallet', label: '👤 Profile' }
                ].map((item) => (
                  <button 
                    key={item.id} 
                    onClick={() => setActiveTab(item.id as TabType)}
                    className="px-3 py-2 text-left hover:bg-zinc-800 text-xs font-bold text-zinc-300 border-b border-zinc-800 last:border-0"
                    style={{ fontFamily: 'monospace' }}
                  >
                    {item.label}
                  </button>
                ))}
                
                {/* ── Claim UBI ── */}
                <button
                  onClick={handleClaimUBI}
                  disabled={claimingUBI}
                  className="px-3 py-2 text-left hover:bg-emerald-800/50 text-xs font-bold text-emerald-400 border-t border-zinc-700 disabled:opacity-50 flex items-center justify-between"
                  style={{ fontFamily: 'monospace' }}
                >
                  <span>💰 Claim G$ UBI</span>
                  {claimingUBI && <RefreshCw size={10} className="animate-spin ml-2" />}
                </button>
              </div>
            )}
          </div>

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
      <div className="w-full flex flex-col gap-4 pointer-events-auto bg-gradient-to-t from-black via-black/85 to-transparent absolute bottom-0 left-0 right-0 z-40">
        {/* Toggleable Drawer panels */}
        {activeTab !== 'none' && activeTab !== 'menu' && (
          <div className="mx-4 mb-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl max-h-[80vh] overflow-y-auto animate-slide-up flex flex-col gap-3">
            {/* Panel Header */}
            <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400 capitalize">
                {activeTab === 'bag' && <Backpack size={14} />}
                {activeTab === 'loadout' && <Sword size={14} />}
                {activeTab === 'stats' && <User size={14} />}
                {activeTab === 'codex' && <BookOpen size={14} />}
                {activeTab === 'wallet' && <User size={14} />}
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
                        const isEquipped = playerData.activeAbility === abilityId;
                        const isNFT = playerData.nftItems?.some((n: any) => n.itemId === abilityId);
                        return (
                          <div key={abilityId} className="flex justify-between items-center bg-black/40 p-2 rounded border border-zinc-800/80">
                            <span className="flex items-center gap-1.5">
                              <span>{def?.icon}</span>
                              <span>{def?.name ?? abilityId}</span>
                              {isNFT && <Gem size={9} className="text-purple-400" />}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-purple-300 bg-purple-950/40 border border-purple-800/40 px-2 py-0.5 rounded">{def?.effect}</span>
                              {isEquipped ? (
                                <span className="text-[9px] bg-yellow-950 text-yellow-400 border border-yellow-800/80 px-2 py-0.5 rounded font-bold">EQUIPPED</span>
                              ) : (
                                <button onClick={() => equipAbility(abilityId)} className="bg-purple-600 hover:bg-purple-500 text-white text-[9px] px-2 py-0.5 rounded font-bold">
                                  EQUIP
                                </button>
                              )}
                            </div>
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
                  <div className="flex justify-between items-center bg-purple-950/40 border border-purple-900/60 p-2 rounded text-purple-300 font-bold text-[11px]">
                    <span>Points invested</span>
                    <span>{totalStatsInvested} / {statCap}</span>
                  </div>

                  {totalStatsInvested < statCap ? (
                    <div className="text-[10px] text-yellow-400 text-center">
                      Each point costs <span className="font-bold">{statCost} 🪙</span> &nbsp;·&nbsp; You have <span className="font-bold">{playerData.gold || 0} 🪙</span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-zinc-500 text-center italic">
                      {playerData.maxUnlockedZone >= 3 ? 'Max stats reached' : 'Clear next zone to unlock 5 more points'}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {[
                      { key: 'strength', name: '🔴 Strength', desc: '+2 DMG per point', val: playerData.stats.strength },
                      { key: 'agility',  name: '🟢 Agility',  desc: '-30ms fire rate per point', val: playerData.stats.agility },
                      { key: 'defense',  name: '🔵 Defense',  desc: '-3 DMG taken per point', val: playerData.stats.defense },
                      { key: 'vitality', name: '🟡 Vitality', desc: '+10 Max HP per point', val: playerData.stats.vitality }
                    ].map(st => {
                      const canBuy = totalStatsInvested < statCap && (playerData.gold || 0) >= statCost;
                      return (
                        <div key={st.key} className="flex justify-between items-center bg-zinc-900/60 p-2 rounded border border-zinc-800">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-semibold text-zinc-300">{st.name}</span>
                            <span className="text-[9px] text-zinc-500">{st.desc}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-sm">{st.val}</span>
                            <button
                              onClick={() => allocateStat(st.key as any)}
                              disabled={!canBuy}
                              className="w-6 h-6 flex justify-center items-center bg-purple-600 hover:bg-purple-500 disabled:opacity-30 rounded text-white font-bold text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
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

              {/* PROFILE */}
              {activeTab === 'wallet' && (() => {
                const levelsCleared = Math.max(0, (playerData.maxUnlockedZone || 1) - 1);
                const nftCount = playerData.nftItems?.length ?? 0;
                const zoneNames: Record<number, string> = { 1: 'Ember Fields', 2: 'Ashwater Marsh', 3: 'Obsidian Peak' };

                return (
                  <div className="flex flex-col gap-3">

                    {/* ── Wallet ── */}
                    {(() => {
                      const displayAddr = walletAddress || playerData?.wallet_address || '';
                      return displayAddr ? (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Wallet</span>
                            {walletConnected
                              ? <span className="text-[9px] bg-green-900/50 text-green-400 border border-green-800/50 px-1.5 py-0.5 rounded-full font-bold">Connected</span>
                              : <span className="text-[9px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded-full font-bold">Reward address</span>
                            }
                          </div>
                          <div className="flex items-center gap-2 bg-black/40 rounded-lg px-2 py-1.5">
                            <span className="text-[10px] font-mono text-zinc-300 flex-1 truncate">
                              {displayAddr.slice(0, 8)}…{displayAddr.slice(-6)}
                            </span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(displayAddr); setAddressCopied(true); setTimeout(() => setAddressCopied(false), 2000); }}
                              className="text-zinc-400 hover:text-white shrink-0 text-[9px] font-bold"
                            >
                              {addressCopied ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={async () => {
                              try {
                                showFlashMessage('Opening Google login...');
                                const { web3authLogin, getUserInfo } = await import('../lib/web3auth');
                                await web3authLogin();
                                // Get the connected address after login
                                const newAddr = await celoService.getConnectedAddress();
                                if (newAddr) {
                                  // Save wallet to Supabase player profile
                                  await dbService.savePlayer({ ...playerData, wallet_address: newAddr });
                                  // Fund the new wallet with CELO if first time
                                  fetch('/api/fund-new-wallet', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ walletAddress: newAddr, userId: playerData.user_id }),
                                  }).then(r => r.json()).then(d => {
                                    if (d.success && !d.skipped) showFlashMessage('Wallet funded with CELO for gas!');
                                  }).catch(console.error);
                                }
                                await connectWallet();
                                showFlashMessage('Logged in with Google! Welcome.');
                              } catch (err) {
                                console.error("Web3Auth Login failed", err);
                                showFlashMessage("Google login failed. Try again.");
                              }
                            }}
                            className="w-full bg-white text-black py-3 rounded-xl text-xs font-bold tracking-wider hover:bg-gray-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
                            Log in with Google
                          </button>
                          <button
                            onClick={connectWallet}
                            className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 text-white py-3 rounded-xl text-xs font-bold tracking-wider hover:brightness-110 active:scale-95 transition-all"
                          >
                            🔌 Connect External Wallet
                          </button>
                        </div>
                      );
                    })()}

                    {/* ── Balances ── */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">G$ Balance</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[15px] font-extrabold text-emerald-300 leading-none">
                            {parseFloat(gDollarBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                          <button onClick={refreshBalance} className="text-emerald-700 hover:text-emerald-400 ml-auto">
                            <RefreshCw size={9} />
                          </button>
                        </div>
                        <span className="text-[9px] text-emerald-700">GoodDollar (Celo)</span>
                      </div>
                      <div className="bg-yellow-950/40 border border-yellow-800/40 rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[9px] text-yellow-500 font-bold uppercase tracking-wider">Gold</span>
                        <span className="text-[15px] font-extrabold text-yellow-300 leading-none mt-0.5">{playerData.gold.toLocaleString()}</span>
                        <span className="text-[9px] text-yellow-700">In-game tokens 🪙</span>
                      </div>
                    </div>

                    {/* ── Progress Stats ── */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Level', value: playerData.level, color: 'text-purple-300', bg: 'bg-purple-950/30 border-purple-800/30' },
                        { label: 'Zones Cleared', value: `${levelsCleared}/3`, color: 'text-blue-300', bg: 'bg-blue-950/30 border-blue-800/30' },
                        { label: 'NFTs Owned', value: nftCount, color: 'text-pink-300', bg: 'bg-pink-950/30 border-pink-800/30' },
                      ].map(stat => (
                        <div key={stat.label} className={`${stat.bg} border rounded-xl p-2.5 flex flex-col items-center gap-1`}>
                          <span className={`text-[16px] font-extrabold ${stat.color}`}>{stat.value}</span>
                          <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider text-center leading-tight">{stat.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* ── Zones cleared list ── */}
                    {levelsCleared > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {Array.from({ length: levelsCleared }, (_, i) => (
                          <span key={i} className="text-[9px] bg-green-900/40 border border-green-700/40 text-green-400 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <CheckCircle2 size={8} /> {zoneNames[i + 1]}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ── Weapons ── */}
                    {playerData.arsenal && playerData.arsenal.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Weapons</span>
                        <div className="flex flex-col gap-1">
                          {playerData.arsenal.map((wId: string) => {
                            const w = TAVERN_WEAPONS.find(x => x.id === wId);
                            const isEquipped = playerData.equippedWeapon === wId;
                            const isNFT = playerData.nftItems?.some((n: any) => n.itemId === wId);
                            return (
                              <div key={wId} className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                                <span className="text-sm">{isNFT ? (GD_ITEMS.find(i => i.id === wId)?.icon ?? '⚔️') : '⚔️'}</span>
                                <span className="text-[10px] font-bold text-zinc-200 flex-1">{w?.name ?? wId}</span>
                                {isNFT && <Gem size={8} className="text-purple-400" />}
                                {isEquipped && <span className="text-[8px] bg-yellow-900/50 text-yellow-400 border border-yellow-700/40 px-1.5 py-0.5 rounded font-bold">Equipped</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Abilities (NFT) ── */}
                    {playerData.abilities && playerData.abilities.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Abilities</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {playerData.abilities.map((aId: string) => {
                            const def = GD_ITEMS.find(i => i.id === aId);
                            return (
                              <span key={aId} className="text-[9px] bg-purple-950/40 border border-purple-700/40 text-purple-300 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                                {def?.icon} {def?.name ?? aId}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Active Buffs ── */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Active Buffs</span>
                      {playerData.ubiBuffActive ? (
                        <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-700/40 rounded-lg px-2.5 py-1.5">
                          <Flame size={12} className="text-amber-400 shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-amber-300">+50% XP & Gold</span>
                            <span className="text-[8px] text-amber-600">Daily UBI buff — 24 hours</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-zinc-600 italic">No active buffs</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* 4. Controls / Joysticks Row */}
        {(activeTab === 'none' || activeTab === 'menu') && (
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
        )}

      </div>

      {/* Level Clear / Potion Shop overlay — rendered LAST so it sits above all other HUD layers */}
      {inLevelClear && (
        <LevelClearScreen
          clearedZone={levelClearZone}
          playerData={playerData}
          setPlayerData={setPlayerData}
          walletAddress={walletAddress || playerData?.wallet_address || undefined}
          onContinue={() => setInLevelClear(false)}
        />
      )}
    </div>
  );
}
