'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { celoService } from '../lib/celo';
import { dbService } from '../lib/supabaseClient';
import { GD_ITEMS, GDollarItemDef, NftItem } from '../lib/nft';
import { MarketListing } from '../lib/marketplace';
import gameBridge from '../game/systems/GameBridge';
import { useVerificationGate } from '../features/verification-gate';
import { X, RefreshCw } from 'lucide-react';

type MarketTab = 'browse' | 'mine';

// A grid cell: either someone's listing, or (on "My Items") an owned item not yet listed.
type Cell =
  | { kind: 'listing'; listing: MarketListing; def: GDollarItemDef }
  | { kind: 'owned'; def: GDollarItemDef };

interface MarketplaceProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress: string;
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  gDollarBalance: string;
  refreshBalance: () => Promise<void>;
  onLeave: () => void;
  showMessage: (msg: string) => void;
  onNeedsVerification?: () => void;
}

const COLS = 2;

const defByToken = (tokenId: number) => GD_ITEMS.find(i => i.tokenId === tokenId) ?? null;

const isOwned = (def: GDollarItemDef, pd: any): boolean =>
  def.category === 'weapon' ? !!pd?.arsenal?.includes(def.id) : !!pd?.abilities?.includes(def.id);

// Add/remove an item from the local profile (arsenal / abilities / nftItems), mirroring TavernShop's buy.
function withOwnership(pd: any, def: GDollarItemDef, owned: boolean, txNote: string): any {
  let next = { ...pd };
  if (def.category === 'weapon') {
    const arsenal = (pd.arsenal || ['bamboo_stick']).filter((id: string) => id !== def.id);
    if (owned) arsenal.push(def.id);
    next = { ...next, arsenal };
    if (owned) next.equippedWeapon = def.id;
    else if (pd.equippedWeapon === def.id) next.equippedWeapon = 'bamboo_stick';
  } else {
    const abilities = (pd.abilities || []).filter((id: string) => id !== def.id);
    if (owned) abilities.push(def.id);
    next = { ...next, abilities };
    if (!owned && pd.activeAbility === def.id) next.activeAbility = null;
  }
  const nftItems: NftItem[] = (pd.nftItems || []).filter((n: NftItem) => n.itemId !== def.id);
  if (owned) nftItems.push({ itemId: def.id, tokenId: def.tokenId, txHash: txNote, mintedAt: new Date().toISOString() });
  return { ...next, nftItems };
}

export default function Marketplace({
  playerData, setPlayerData,
  walletAddress, connectWallet,
  gDollarBalance, refreshBalance,
  onLeave, showMessage, onNeedsVerification,
}: MarketplaceProps) {
  const { ensureVerified } = useVerificationGate({ walletAddress, connectWallet, showMessage, onNeedsVerification });
  const [tab, setTab]           = useState<MarketTab>('browse');
  const [cursor, setCursor]     = useState(0);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);
  const [pricing, setPricing]   = useState<GDollarItemDef | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [feeBps, setFeeBps]     = useState(0);
  const [names, setNames]       = useState<Record<string, string>>({});
  const mode = celoService.marketMode();
  const lastJoyRef = useRef(0);

  const me = (walletAddress || '').toLowerCase();

  const cells: Cell[] = (() => {
    if (tab === 'browse') {
      return [...listings]
        .sort((a, b) => a.price - b.price || a.id - b.id)
        .flatMap(l => { const def = defByToken(l.tokenId); return def ? [{ kind: 'listing' as const, listing: l, def }] : []; });
    }
    const mine = listings.filter(l => l.seller === me);
    const listed: Cell[] = mine.flatMap(l => { const def = defByToken(l.tokenId); return def ? [{ kind: 'listing' as const, listing: l, def }] : []; });
    const owned: Cell[] = GD_ITEMS.filter(d => isOwned(d, playerData)).map(def => ({ kind: 'owned' as const, def }));
    return [...listed, ...owned];
  })();

  // Refs so window-level listeners always see current values
  const live = useRef({ tab, cursor, cells, busy, pricing, me, gDollarBalance, playerData });
  live.current = { tab, cursor, cells, busy, pricing, me, gDollarBalance, playerData };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ls = await celoService.getMarketListings();
      setListings(ls);
      dbService.getPlayerNames(ls.map(l => l.seller)).then(setNames).catch(() => {});
    } catch (err) {
      console.error('getMarketListings failed:', err);
      showMessage('Could not load listings.');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => { load(); celoService.getMarketFeeBps().then(setFeeBps); }, [load]);

  const switchTab = useCallback((t: MarketTab) => { setTab(t); setCursor(0); }, []);

  const move = useCallback((d: number) => {
    setCursor(c => Math.max(0, Math.min(live.current.cells.length - 1, c + d)));
  }, []);

  useEffect(() => {
    document.querySelector(`[data-market-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, tab, listings.length]);

  const ensureWallet = async (): Promise<string> => {
    let addr = live.current.me;
    if (!addr) {
      await connectWallet();
      addr = ((await celoService.getConnectedAddress()) ?? '').toLowerCase();
    }
    if (!addr) showMessage('Connect your wallet to trade.');
    return addr;
  };

  // Every on-chain action costs CELO gas, and social-login wallets only get a small one-time drip.
  // Check up front so players see a real reason instead of a generic "failed".
  const MIN_GAS_CELO = 0.001;
  const hasGas = async (addr: string): Promise<boolean> => {
    if (celoService.marketMode() !== 'chain') return true;
    const celo = await celoService.getCeloBalance(addr);
    if (celo >= MIN_GAS_CELO) return true;
    showMessage(`Not enough CELO for gas (${celo.toFixed(4)}). Send a little CELO to ${addr.slice(0, 6)}…${addr.slice(-4)}.`);
    return false;
  };

  const sellerLabel = (addr: string) => names[addr] || `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  // ── Actions ────────────────────────────────────────────────────────────────
  const buy = async (listing: MarketListing, def: GDollarItemDef) => {
    const { me: cur, playerData: pd, gDollarBalance: bal } = live.current;
    if (cur && listing.seller === cur) { showMessage('That is your listing — cancel it from My Items.'); return; }
    if (isOwned(def, pd))              { showMessage(`You already own ${def.name}!`); return; }
    if (parseFloat(bal) < listing.price) { showMessage(`Need ${listing.price} G$ to buy ${def.name}.`); return; }

    setBusy(true);
    try {
      if (!(await ensureVerified('marketplaceBuy'))) return;
      const addr = await ensureWallet();
      if (!addr) return;
      if (!(await hasGas(addr))) return;
      showMessage(`Buying ${def.name} for ${listing.price} G$…`);
      const ok = await celoService.buyListing(addr, listing);
      if (!ok) { showMessage('Purchase failed — it may have just been sold.'); return; }
      setPlayerData((prev: any) => {
        const updated = withOwnership(prev, def, true, `market_buy_${listing.id}`);
        dbService.savePlayer(updated);
        return updated;
      });
      await refreshBalance();
      showMessage(`${def.icon} ${def.name} bought!`);
    } catch (err) {
      console.error('market buy failed:', err);
      showMessage('Purchase failed. Please try again.');
    } finally {
      setBusy(false);
      load();
    }
  };

  const cancel = async (listing: MarketListing, def: GDollarItemDef) => {
    setBusy(true);
    try {
      const addr = await ensureWallet();
      if (!addr) return;
      if (!(await hasGas(addr))) return;
      showMessage(`Cancelling ${def.name} listing…`);
      const ok = await celoService.cancelListing(addr, listing.id);
      if (!ok) { showMessage('Cancel failed.'); return; }
      setPlayerData((prev: any) => {
        const updated = withOwnership(prev, def, true, `market_cancel_${listing.id}`);
        dbService.savePlayer(updated);
        return updated;
      });
      showMessage(`${def.icon} ${def.name} returned to you.`);
    } catch (err) {
      console.error('market cancel failed:', err);
      showMessage('Cancel failed. Please try again.');
    } finally {
      setBusy(false);
      load();
    }
  };

  const submitListing = async (def: GDollarItemDef, rawPrice: string) => {
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0) { showMessage('Enter a price above 0.'); return; }
    // The contract stores 18 decimals; cap input precision so parseUnits can't choke on 1e-7 style strings.
    const clean = Math.round(price * 100) / 100;
    if (clean <= 0) { showMessage('Price must be at least 0.01 G$.'); return; }

    setPricing(null);
    setBusy(true);
    try {
      const addr = await ensureWallet();
      if (!addr) return;
      if (!(await hasGas(addr))) return;
      showMessage(`Listing ${def.name} for ${clean} G$…`);
      const ok = await celoService.listItem(addr, def.tokenId, clean);
      if (!ok) { showMessage('Listing failed. Do you still own this item?'); return; }
      setPlayerData((prev: any) => {
        const updated = withOwnership(prev, def, false, '');
        dbService.savePlayer(updated);
        return updated;
      });
      showMessage(`${def.icon} ${def.name} listed for ${clean} G$.`);
    } catch (err) {
      console.error('market list failed:', err);
      showMessage('Listing failed. Please try again.');
    } finally {
      setBusy(false);
      load();
    }
  };

  const openPricing = (def: GDollarItemDef) => { setPriceInput(String(def.gdCost)); setPricing(def); };

  const act = (idx: number) => {
    const { cells: cs, tab: t, busy: b, pricing: p } = live.current;
    const cell = cs[idx];
    if (!cell || b || p) return;
    if (cell.kind === 'owned') return openPricing(cell.def);
    if (t === 'mine') return void cancel(cell.listing, cell.def);
    return void buy(cell.listing, cell.def);
  };

  // ── Keyboard + joystick navigation ─────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (live.current.pricing) return; // price modal owns the keyboard
      switch (e.key) {
        case 'ArrowLeft':  move(-1); break;
        case 'ArrowRight': move(1); break;
        case 'ArrowUp':    move(-COLS); break;
        case 'ArrowDown':  move(COLS); break;
        case 'Tab':
          e.preventDefault();
          switchTab(live.current.tab === 'browse' ? 'mine' : 'browse');
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          act(live.current.cursor);
          break;
        case 'Escape': onLeave(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move, onLeave, switchTab]);

  useEffect(() => {
    const unsub = gameBridge.on('joystick_left', (dir: { x: number; y: number }) => {
      if (live.current.pricing) return;
      const now = Date.now();
      if (now - lastJoyRef.current < 280) return;
      const ax = Math.abs(dir.x), ay = Math.abs(dir.y);
      if (ax < 0.4 && ay < 0.4) return;
      lastJoyRef.current = now;
      if (ax >= ay) move(dir.x > 0 ? 1 : -1);
      else move(dir.y > 0 ? COLS : -COLS);
    });
    return unsub;
  }, [move]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const tabBtn = (t: MarketTab, label: string, sub: string, color: string) => (
    <button
      onClick={() => switchTab(t)}
      className={`py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${t === 'browse' ? 'border-r border-zinc-800' : ''} ${
        tab === t ? `${color} border-b-2` : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {label}
      <span className="block text-[8px] font-normal text-zinc-600 normal-case tracking-normal">{sub}</span>
    </button>
  );

  const cellBorder = (cell: Cell, active: boolean) => {
    if (!active) return 'border-zinc-700/40';
    if (cell.kind === 'owned') return 'border-purple-500 shadow-purple-500/20 shadow-lg';
    if (tab === 'mine' || cell.listing.seller === me) return 'border-blue-500 shadow-blue-500/20 shadow-lg';
    if (isOwned(cell.def, playerData)) return 'border-zinc-500';
    return parseFloat(gDollarBalance) >= cell.listing.price
      ? 'border-emerald-500 shadow-emerald-500/20 shadow-lg'
      : 'border-red-500 shadow-red-500/20 shadow-lg';
  };

  const renderAction = (cell: Cell, idx: number) => {
    const btn = 'w-full mt-0.5 px-1 py-0.5 rounded text-[8px] font-bold active:scale-95 transition-all disabled:opacity-60';
    const click = (e: React.MouseEvent) => { e.stopPropagation(); setCursor(idx); act(idx); };
    if (cell.kind === 'owned') {
      return <button onClick={click} disabled={busy} className={`${btn} bg-purple-700 hover:bg-purple-600 text-white`}>List for sale</button>;
    }
    if (tab === 'mine') {
      return <button onClick={click} disabled={busy} className={`${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600`}>Cancel · {cell.listing.price} G$</button>;
    }
    if (cell.listing.seller === me) {
      return <span className={`${btn} text-center bg-blue-950/40 text-blue-400 border border-blue-800/50`}>YOUR LISTING</span>;
    }
    if (isOwned(cell.def, playerData)) {
      return <span className={`${btn} text-center bg-zinc-900 text-zinc-500 border border-zinc-700`}>✓ OWNED</span>;
    }
    const affordable = parseFloat(gDollarBalance) >= cell.listing.price;
    return (
      <button
        onClick={click}
        disabled={busy || !affordable}
        className={`${btn} ${affordable ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-zinc-800 text-red-400 border border-red-900/40'}`}
      >
        {affordable ? `${cell.listing.price} G$` : `Need ${cell.listing.price} G$`}
      </button>
    );
  };

  const emptyText = tab === 'browse'
    ? 'No items for sale yet. List one from My Items!'
    : 'You have nothing to list. Buy gear in the Tavern first.';

  const pricingNum = Number(priceInput);
  const pricingValid = Number.isFinite(pricingNum) && pricingNum > 0;
  const net = pricingValid ? pricingNum - (pricingNum * feeBps) / 10_000 : 0;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/97 backdrop-blur-sm font-mono text-zinc-100 pointer-events-auto overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-yellow-900/40 bg-zinc-950 shrink-0">
        <span className="text-[9px] text-zinc-500">
          {mode === 'mock' ? 'Dev market (local, no wallet)' : `Balance: ${gDollarBalance} G$`}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} aria-label="Refresh listings" className="text-zinc-400 hover:text-white p-0.5 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onLeave} aria-label="Close marketplace" className="text-zinc-500 hover:text-zinc-200 p-0.5">
            <X size={15} />
          </button>
        </div>
      </div>

      {mode === 'unavailable' ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center gap-2 text-zinc-500 p-6">
          <span className="text-4xl">🛒</span>
          <span className="text-sm font-bold text-zinc-300">Marketplace not live yet</span>
          <p className="text-xs max-w-xs">The marketplace contract hasn&apos;t been deployed to this network.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 border-b border-zinc-800 shrink-0">
            {tabBtn('browse', '🛒 Browse', `${listings.length} for sale`, 'text-emerald-400 bg-emerald-950/20 border-b-emerald-500')}
            {tabBtn('mine', '🎒 My Items', 'List or cancel', 'text-purple-400 bg-purple-950/20 border-b-purple-500')}
          </div>

          <div className="overflow-y-auto overscroll-contain flex-1" style={{ touchAction: 'pan-y' }}>
            {loading && cells.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 p-6">Loading listings…</p>
            ) : cells.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 p-6">{emptyText}</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 p-1.5">
                {cells.map((cell, idx) => {
                  const active = idx === cursor;
                  return (
                    <div
                      key={cell.kind === 'listing' ? `l${cell.listing.id}` : `o${cell.def.id}`}
                      data-market-idx={idx}
                      onClick={() => setCursor(idx)}
                      className={`flex flex-col items-center justify-center p-1 rounded-lg border-2 transition-all text-center select-none min-h-24 gap-0.5
                        ${active ? 'bg-zinc-800/70' : 'bg-zinc-900/30 hover:bg-zinc-800/30'} ${cellBorder(cell, active)}`}
                    >
                      <div className="relative w-8 h-8 shrink-0">
                        <Image src={`/nft/${cell.def.id}.png`} alt={cell.def.name} fill className="object-contain rounded" sizes="32px" />
                      </div>
                      <span className={`text-[8px] font-bold leading-tight ${active ? 'text-zinc-100' : 'text-zinc-300'}`}>{cell.def.name}</span>
                      <span className="text-[7px] text-zinc-500 leading-tight">
                        {cell.def.effect}
                        {cell.kind === 'listing' && tab === 'browse' && ` · ${sellerLabel(cell.listing.seller)}`}
                      </span>
                      {renderAction(cell, idx)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-zinc-800 px-2 py-1 text-[8px] text-zinc-600 text-center">
            Arrows move · Enter selects · Tab switches · Esc closes
          </div>
        </>
      )}

      {/* ── Set-price modal ─────────────────────────────────────────────────── */}
      {pricing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="bg-zinc-950 border-2 border-purple-900/50 p-4 rounded-xl flex flex-col gap-3 w-full max-w-xs">
            <h2 className="text-purple-300 font-bold text-sm border-b border-zinc-800 pb-2">
              {pricing.icon} List {pricing.name}
            </h2>
            <label className="text-[10px] text-zinc-400 flex flex-col gap-1">
              Price (G$)
              <input
                autoFocus
                type="number"
                min="0.01"
                step="any"
                inputMode="decimal"
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); e.stopPropagation(); submitListing(pricing, priceInput); }
                  if (e.key === 'Escape') { e.stopPropagation(); setPricing(null); }
                }}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-purple-500"
              />
            </label>
            <p className="text-[9px] text-zinc-500">
              Shop price {pricing.gdCost} G$.
              {feeBps > 0 && pricingValid && ` Marketplace fee ${feeBps / 100}% — you receive ${net.toFixed(2)} G$.`}
              {feeBps === 0 && ' No marketplace fee.'}
              {' '}The item is held in escrow until sold or cancelled.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPricing(null)} className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold py-1.5 rounded border border-zinc-700 text-xs">
                Cancel
              </button>
              <button
                onClick={() => submitListing(pricing, priceInput)}
                disabled={!pricingValid}
                className="flex-1 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-1.5 rounded text-xs"
              >
                List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
