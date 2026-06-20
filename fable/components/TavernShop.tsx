'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { celoService, GAME_TREASURY_ADDRESS } from '../lib/celo';
import { dbService } from '../lib/supabaseClient';
import { GD_ITEMS, GOLD_ITEMS, GDollarItemDef, GoldItemDef } from '../lib/nft';
import gameBridge from '../game/systems/GameBridge';
import { X, Gem } from 'lucide-react';

// Re-export weapon list for HUD loadout panel
export const TAVERN_WEAPONS = GD_ITEMS.filter(i => i.category === 'weapon').map(i => ({
  id: i.id, name: i.name, attack: i.attack ?? 0,
}));

type ShopTab = 'gold' | 'gd';

interface TavernShopProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress: string;
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  gDollarBalance: string;
  refreshBalance: () => Promise<void>;
  onLeave: () => void;
  showMessage: (msg: string) => void;
}

const GD_COLS = 2;  // weapons col 0, abilities col 1
const GD_ROWS = 3;
const GOLD_COLS = 2; // potions col 0, buffs col 1
const GOLD_ROWS = 3;

export default function TavernShop({
  playerData, setPlayerData,
  walletAddress, walletConnected, connectWallet,
  gDollarBalance, refreshBalance,
  onLeave, showMessage,
}: TavernShopProps) {
  const [tab, setTab]       = useState<ShopTab>('gold');
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const [buying, setBuying] = useState(false);
  const lastJoyRef          = useRef(0);

  // Refs so event-listener closures always see fresh values
  const playerDataRef    = useRef(playerData);
  const gDollarRef       = useRef(gDollarBalance);
  const walletAddrRef    = useRef(walletAddress);
  const buyingRef        = useRef(buying);
  const cursorRef        = useRef(cursor);
  const tabRef           = useRef(tab);

  useEffect(() => { playerDataRef.current    = playerData;      }, [playerData]);
  useEffect(() => { gDollarRef.current       = gDollarBalance;  }, [gDollarBalance]);
  useEffect(() => { walletAddrRef.current    = walletAddress;   }, [walletAddress]);
  useEffect(() => { buyingRef.current        = buying;          }, [buying]);
  useEffect(() => { cursorRef.current        = cursor;          }, [cursor]);
  useEffect(() => { tabRef.current           = tab;             }, [tab]);

  // Reset cursor when changing tabs
  const switchTab = useCallback((t: ShopTab) => {
    setTab(t);
    setCursor({ col: 0, row: 0 });
  }, []);

  const cols = tab === 'gold' ? GOLD_COLS : GD_COLS;
  const rows = tab === 'gold' ? GOLD_ROWS : GD_ROWS;

  const getGdItem   = (col: number, row: number): GDollarItemDef | null =>
    GD_ITEMS.find(i => i.col === col && i.row === row) ?? null;
  const getGoldItem = (col: number, row: number): GoldItemDef | null =>
    GOLD_ITEMS.find(i => i.col === col && i.row === row) ?? null;

  const isGdOwned = (id: string, pd = playerDataRef.current): boolean => {
    const item = GD_ITEMS.find(i => i.id === id);
    if (!item) return false;
    if (item.category === 'weapon')  return pd.arsenal?.includes(id);
    if (item.category === 'ability') return pd.abilities?.includes(id);
    return false;
  };

  const canAffordGd   = (gdCost: number) => parseFloat(gDollarRef.current) >= gdCost;
  const canAffordGold = (goldCost: number) => (playerDataRef.current.gold ?? 0) >= goldCost;

  const move = useCallback((dCol: number, dRow: number) => {
    const maxCols = tabRef.current === 'gold' ? GOLD_COLS : GD_COLS;
    const maxRows = tabRef.current === 'gold' ? GOLD_ROWS : GD_ROWS;
    setCursor(prev => ({
      col: Math.max(0, Math.min(maxCols - 1, prev.col + dCol)),
      row: Math.max(0, Math.min(maxRows - 1, prev.row + dRow)),
    }));
  }, []);

  // ── Gold purchase (no signing) ─────────────────────────────────────────────
  const buyGoldItem = useCallback(async () => {
    const { col, row } = cursorRef.current;
    const item = GOLD_ITEMS.find(i => i.col === col && i.row === row);
    if (!item || buyingRef.current) return;

    const pd = playerDataRef.current;
    if ((pd.gold ?? 0) < item.goldCost) {
      showMessage(`Need ${item.goldCost}🪙 — not enough gold!`);
      return;
    }

    setBuying(true);
    try {
      setPlayerData((prev: any) => {
        let updated = { ...prev, gold: prev.gold - item.goldCost };
        if (item.heal) {
          updated.hp = Math.min(prev.maxHp, prev.hp + item.heal);
          gameBridge.emit('player_health_changed', { hp: updated.hp });
        }
        if (item.fullHeal) {
          updated.hp = prev.maxHp;
          gameBridge.emit('player_health_changed', { hp: updated.hp });
        }
        if (item.tempBuff) {
          updated.tempBuff = item.tempBuff; // scene picks this up from sync_player_data
        }
        dbService.savePlayer(updated);
        return updated;
      });
      showMessage(`${item.icon} ${item.name} used! ${item.effect}`);
    } finally {
      setBuying(false);
    }
  }, [setPlayerData, showMessage]);

  // ── G$ purchase (signs tx → mints NFT) ────────────────────────────────────
  const buyGdItem = useCallback(async () => {
    const { col, row } = cursorRef.current;
    const item = GD_ITEMS.find(i => i.col === col && i.row === row);
    if (!item || buyingRef.current) return;

    const pd = playerDataRef.current;
    if (isGdOwned(item.id, pd)) {
      showMessage(`You already own ${item.name}!`);
      return;
    }

    if (parseFloat(gDollarRef.current) < item.gdCost) {
      showMessage(`Need ${item.gdCost} G$ — claim your GoodDollar UBI first!`);
      return;
    }

    setBuying(true);
    try {
      // 1. Ensure wallet connected
      let addr = walletAddrRef.current;
      if (!addr) {
        await connectWallet();
        addr = (await celoService.getConnectedAddress()) ?? '';
      }
      if (!addr) { showMessage('Connect your wallet to purchase with G$.'); return; }

      // 2. Transfer G$ on-chain (user signs this tx)
      const { success, txHash } = await celoService.transferG$(addr, GAME_TREASURY_ADDRESS, String(item.gdCost));
      if (!success) { showMessage('G$ transfer failed. Check your balance.'); return; }

      await refreshBalance();

      // 3. Mint NFT via server API (server wallet signs mint tx)
      showMessage(`Minting ${item.name} NFT to your wallet…`);
      const nftItem = await celoService.mintNFTViaAPI(addr, item.id, txHash, item.gdCost);

      // 4. Update player data + record NFT
      setPlayerData((prev: any) => {
        let updated = { ...prev };
        if (item.category === 'weapon') {
          const arsenal = [...(prev.arsenal || ['bamboo_stick'])];
          if (!arsenal.includes(item.id)) arsenal.push(item.id);
          updated = { ...updated, arsenal, equippedWeapon: item.id };
        } else if (item.category === 'ability') {
          const abilities = [...(prev.abilities || [])];
          if (!abilities.includes(item.id)) abilities.push(item.id);
          updated = { ...updated, abilities };
        }
        if (nftItem) {
          const nftItems = [...(prev.nftItems || [])];
          if (!nftItems.some(n => n.itemId === item.id)) nftItems.push(nftItem);
          updated = { ...updated, nftItems };
        }
        dbService.savePlayer(updated);
        return updated;
      });

      const nftMsg = nftItem?.txHash.startsWith('mock_')
        ? `(NFT recorded — awaiting contract deployment)`
        : `NFT minted! Tx: ${nftItem?.txHash.slice(0, 10)}…`;
      showMessage(`${item.icon} ${item.name} purchased! ${nftMsg}`);
    } catch (err) {
      console.error('G$ purchase failed:', err);
      showMessage('Purchase failed. Please try again.');
    } finally {
      setBuying(false);
    }
  }, [connectWallet, refreshBalance, setPlayerData, showMessage]);

  // Dispatch to correct buy fn based on active tab
  const handleBuyRef = useRef<() => void>(() => {});
  handleBuyRef.current = tab === 'gold' ? buyGoldItem : buyGdItem;

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':  move(-1,  0); break;
        case 'ArrowRight': move( 1,  0); break;
        case 'ArrowUp':    move( 0, -1); break;
        case 'ArrowDown':  move( 0,  1); break;
        case 'Tab':
          e.preventDefault();
          switchTab(tabRef.current === 'gold' ? 'gd' : 'gold');
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          handleBuyRef.current();
          break;
        case 'Escape':
          onLeave();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, onLeave, switchTab]);

  // ── Joystick navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = gameBridge.on('joystick_left', (dir: { x: number; y: number }) => {
      const now = Date.now();
      if (now - lastJoyRef.current < 280) return;
      const ax = Math.abs(dir.x), ay = Math.abs(dir.y);
      if (ax < 0.4 && ay < 0.4) return;
      lastJoyRef.current = now;
      if (ax >= ay) move(dir.x > 0 ? 1 : -1, 0);
      else move(0, dir.y > 0 ? 1 : -1);
    });
    return unsub;
  }, [move]);

  // ── Render helpers ───────────────────────────────────────────────────────
  const activeGdItem   = tab === 'gd'   ? getGdItem(cursor.col, cursor.row)   : null;
  const activeGoldItem = tab === 'gold' ? getGoldItem(cursor.col, cursor.row) : null;

  const gdCellBorder = (item: GDollarItemDef, isActive: boolean) => {
    if (!isActive) return 'border-zinc-700/40';
    if (isGdOwned(item.id)) return 'border-blue-500 shadow-blue-500/20 shadow-lg';
    if (canAffordGd(item.gdCost)) return 'border-emerald-500 shadow-emerald-500/20 shadow-lg';
    return 'border-red-500 shadow-red-500/20 shadow-lg';
  };

  const goldCellBorder = (item: GoldItemDef | null, isActive: boolean) => {
    if (!item || !isActive) return 'border-zinc-700/40';
    if (canAffordGold(item.goldCost)) return 'border-yellow-500 shadow-yellow-500/20 shadow-lg';
    return 'border-red-500 shadow-red-500/20 shadow-lg';
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/97 backdrop-blur-sm font-mono text-zinc-100 pointer-events-auto overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-yellow-900/40 bg-gradient-to-r from-amber-950/70 to-zinc-950 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🍺</span>
          <div>
            <h1 className="text-[11px] font-extrabold text-yellow-400 tracking-widest uppercase leading-tight">The Tavern</h1>
            <p className="text-[8px] text-zinc-500 italic">"Fine arms & remedies for bold heroes."</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-yellow-400 bg-yellow-950/40 border border-yellow-800/40 px-2 py-0.5 rounded">
            🪙 {playerData.gold ?? 0}G
          </span>
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded">
            💲 {parseFloat(gDollarBalance).toFixed(2)} G$
          </span>
          <button onClick={onLeave} className="text-zinc-500 hover:text-zinc-200 p-0.5">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Tab switcher ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 border-b border-zinc-800 shrink-0">
        <button
          onClick={() => switchTab('gold')}
          className={`py-2 text-[10px] font-bold uppercase tracking-widest border-r border-zinc-800 transition-colors ${
            tab === 'gold'
              ? 'text-yellow-400 bg-yellow-950/20 border-b-2 border-b-yellow-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          🪙 Gold Shop
          <span className="block text-[8px] font-normal text-zinc-600 normal-case tracking-normal">No signing required</span>
        </button>
        <button
          onClick={() => switchTab('gd')}
          className={`py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
            tab === 'gd'
              ? 'text-emerald-400 bg-emerald-950/20 border-b-2 border-b-emerald-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span className="flex items-center justify-center gap-1">
            💲 G$ Shop <Gem size={10} className="text-purple-400" />
          </span>
          <span className="block text-[8px] font-normal text-zinc-600 normal-case tracking-normal">Signs tx · mints NFT to wallet</span>
        </button>
      </div>

      {/* ── Gold Shop grid ────────────────────────────────────────────────── */}
      {tab === 'gold' && (
        <>
          {/* Column headers */}
          <div className="grid grid-cols-2 border-b border-zinc-800/50 shrink-0">
            {['🧪 Potions', '⚡ Buffs'].map((label, i) => (
              <div key={i} className={`py-1.5 text-center text-[9px] font-bold uppercase tracking-widest border-r border-zinc-800/40 last:border-r-0 ${cursor.col === i && tab === 'gold' ? 'text-yellow-400 bg-yellow-950/20' : 'text-zinc-600'}`}>
                {label}
              </div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-2 gap-2 p-2 min-h-0">
            {Array.from({ length: GOLD_COLS }, (_, col) => (
              <div key={col} className="flex flex-col gap-2 h-full">
                {Array.from({ length: GOLD_ROWS }, (_, row) => {
                  const item    = getGoldItem(col, row);
                  const isActive = cursor.col === col && cursor.row === row;
                  if (!item) return (
                    <div key={`${col}-${row}`} className="flex-1 rounded-lg border-2 border-zinc-800/20 bg-zinc-900/10" />
                  );
                  const affordable = canAffordGold(item.goldCost);
                  return (
                    <button
                      key={item.id}
                      onClick={() => { if (isActive) handleBuyRef.current(); else setCursor({ col, row }); }}
                      className={`flex-1 flex flex-col items-center justify-center p-1.5 rounded-lg border-2 transition-all text-center select-none
                        ${isActive ? 'bg-zinc-800/70 scale-[1.03]' : 'bg-zinc-900/30 hover:bg-zinc-800/30'}
                        ${goldCellBorder(item, isActive)}`}
                    >
                      <span className="text-2xl leading-none mb-1">{item.icon}</span>
                      <span className={`text-[9px] font-bold leading-tight ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>{item.name}</span>
                      <span className="text-[8px] text-zinc-500 mt-0.5">{item.effect}</span>
                      <span className={`text-[8px] font-bold mt-1 ${affordable ? 'text-yellow-400' : 'text-red-400'}`}>
                        {item.goldCost}🪙
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Gold item detail bar */}
          <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 shrink-0 flex flex-col gap-1.5">
            {activeGoldItem && (
              <div className="flex items-center gap-2">
                <span className="text-xl shrink-0">{activeGoldItem.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-zinc-100 truncate">{activeGoldItem.name}</span>
                    <span className="text-[8px] bg-yellow-950/50 text-yellow-400 border border-yellow-800/40 px-1 py-0.5 rounded shrink-0">Gold</span>
                  </div>
                  <p className="text-[9px] text-zinc-400 italic">{activeGoldItem.desc}</p>
                </div>
                <button
                  onClick={() => handleBuyRef.current()}
                  disabled={buying || !canAffordGold(activeGoldItem.goldCost)}
                  className={`shrink-0 px-3 py-1.5 rounded text-[10px] font-bold transition-all active:scale-95 ${
                    buying ? 'bg-zinc-700 text-zinc-400'
                    : canAffordGold(activeGoldItem.goldCost) ? 'bg-yellow-600 hover:bg-yellow-500 text-black'
                    : 'bg-zinc-800 text-red-400 border border-red-900/40 cursor-not-allowed'
                  }`}
                >
                  {buying ? '⏳' : canAffordGold(activeGoldItem.goldCost) ? `BUY ${activeGoldItem.goldCost}🪙` : 'Need Gold'}
                </button>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
              <span className="text-[8px] text-zinc-600">Tab = switch shop · ← → ↑ ↓ navigate · Enter to buy</span>
              <button onClick={onLeave} className="text-[10px] font-bold text-red-400 hover:text-red-300 border border-red-900/40 bg-red-950/20 px-3 py-1.5 rounded active:scale-95 ml-2">
                🚪 Leave
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── G$ Shop grid ─────────────────────────────────────────────────── */}
      {tab === 'gd' && (
        <>
          {/* Column headers */}
          <div className="grid grid-cols-2 border-b border-zinc-800/50 shrink-0">
            {['⚔️ Weapons (NFT)', '💫 Abilities (NFT)'].map((label, i) => (
              <div key={i} className={`py-1.5 text-center text-[9px] font-bold uppercase tracking-widest border-r border-zinc-800/40 last:border-r-0 ${cursor.col === i && tab === 'gd' ? 'text-emerald-400 bg-emerald-950/20' : 'text-zinc-600'}`}>
                {label}
              </div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-2 gap-2 p-2 min-h-0">
            {Array.from({ length: GD_COLS }, (_, col) => (
              <div key={col} className="flex flex-col gap-2 h-full">
                {Array.from({ length: GD_ROWS }, (_, row) => {
                  const item     = getGdItem(col, row);
                  const isActive = cursor.col === col && cursor.row === row;
                  if (!item) return null;
                  const owned      = isGdOwned(item.id);
                  const affordable = canAffordGd(item.gdCost);
                  return (
                    <button
                      key={item.id}
                      onClick={() => { if (isActive) handleBuyRef.current(); else setCursor({ col, row }); }}
                      className={`flex-1 flex flex-col items-center justify-center p-1.5 rounded-lg border-2 transition-all text-center select-none
                        ${isActive ? 'bg-zinc-800/70 scale-[1.03]' : 'bg-zinc-900/30 hover:bg-zinc-800/30'}
                        ${gdCellBorder(item, isActive)}`}
                    >
                      <div className="relative w-10 h-10 mb-1 shrink-0">
                        <Image
                          src={`/nft/${item.id}.png`}
                          alt={item.name}
                          fill
                          className="object-contain rounded"
                          sizes="40px"
                        />
                      </div>
                      <span className={`text-[9px] font-bold leading-tight ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>{item.name}</span>
                      <span className="text-[8px] text-zinc-500 mt-0.5">{item.effect}</span>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`text-[8px] font-bold ${owned ? 'text-blue-400' : affordable ? 'text-emerald-400' : 'text-red-400'}`}>
                          {owned ? '✓ OWNED' : `${item.gdCost} G$`}
                        </span>
                        {!owned && <Gem size={7} className="text-purple-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* G$ item detail bar */}
          <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 shrink-0 flex flex-col gap-1.5">
            {activeGdItem && (
              <div className="flex items-center gap-2">
                <div className="relative w-9 h-9 shrink-0">
                  <Image
                    src={`/nft/${activeGdItem.id}.png`}
                    alt={activeGdItem.name}
                    fill
                    className="object-contain rounded"
                    sizes="36px"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-zinc-100 truncate">{activeGdItem.name}</span>
                    <span className="text-[8px] bg-purple-950/50 text-purple-300 border border-purple-800/40 px-1 py-0.5 rounded shrink-0 flex items-center gap-0.5">
                      <Gem size={7} /> NFT
                    </span>
                    <span className="text-[8px] capitalize text-zinc-500 shrink-0">{activeGdItem.category}</span>
                  </div>
                  <p className="text-[9px] text-zinc-400 italic">{activeGdItem.desc}</p>
                </div>
                <div className="shrink-0">
                  {isGdOwned(activeGdItem.id) ? (
                    <span className="text-[10px] text-blue-400 font-bold border border-blue-800/50 bg-blue-950/20 px-2 py-1 rounded">OWNED</span>
                  ) : (
                    <button
                      onClick={() => handleBuyRef.current()}
                      disabled={buying || !canAffordGd(activeGdItem.gdCost)}
                      className={`px-3 py-1.5 rounded text-[10px] font-bold transition-all active:scale-95 ${
                        buying ? 'bg-zinc-700 text-zinc-400'
                        : canAffordGd(activeGdItem.gdCost) ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-zinc-800 text-red-400 border border-red-900/40 cursor-not-allowed'
                      }`}
                    >
                      {buying ? '⏳ Minting…' : canAffordGd(activeGdItem.gdCost) ? `💲 ${activeGdItem.gdCost} G$` : 'Need G$'}
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
              <span className="text-[8px] text-zinc-600">Tab = switch shop · purchases mint an NFT to your wallet</span>
              <button onClick={onLeave} className="text-[10px] font-bold text-red-400 hover:text-red-300 border border-red-900/40 bg-red-950/20 px-3 py-1.5 rounded active:scale-95 ml-2">
                🚪 Leave
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
