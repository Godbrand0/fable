import { createClient } from '@supabase/supabase-js';
import { NftItem } from './nft';
import type { LeaderboardMode } from './scoreLedger';
import { DEFAULT_SKIN } from './skins';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const isConfigured    = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

const LOCAL_KEY       = 'fable_local_players';
const LEADERBOARD_KEY = 'fable_local_leaderboard';

export interface PlayerData {
  wallet_address: string;
  name: string;
  class: string;
  skin: string;                // character skin id (see lib/skins.ts) — chosen once at creation
  level: number;
  xp: number;
  gold: number;
  maxHp: number;
  hp: number;
  stats: {
    strength: number;
    agility: number;
    defense: number;
    vitality: number;
  };
  statPoints: number;
  maxUnlockedZone: number;
  equippedWeapon: string;
  arsenal: string[];          // weapon IDs owned (includes free starter + G$ purchases)
  abilities: string[];        // ability IDs owned via G$ purchase
  inventory: Array<{ item: string; count: number }>;
  nftItems: NftItem[];        // on-chain NFT records
  ubiBuffActive: boolean;
  ubiBuffExpiresAt: number | null;
  activeAbility: string | null;
  pendingRewards: string[];
  onboarded: boolean;          // has the player completed the Guildmaster tutorial?
  zoneProgress: Record<string, { enemiesDefeated: number }>;  // mid-zone kill progress, keyed by scene key
  currentZone: string | null;  // which zone scene "Continue" should resume into
  lastProgressSync?: {        // last "Commit Progress" on-chain sync
    level: number;
    gold: number;
    txHash: string;
    syncedAt: string;
  };
}

export interface LeaderboardEntry {
  wallet_address: string;
  mode: LeaderboardMode;
  player_name: string;
  zone_clears: number;
  score: number;
}

// Normalise a row from either Supabase (lowercase keys) or localStorage (camelCase).
export function normalizePlayer(p: any): PlayerData {
  return {
    wallet_address:   p.wallet_address   ?? 'local_player',
    name:             p.name             ?? 'Hero',
    class:            p.hero_class       ?? p.class        ?? 'knight',
    skin:             p.skin             ?? DEFAULT_SKIN,
    level:            p.level            ?? 1,
    xp:               p.xp               ?? 0,
    gold:             p.gold             ?? 100,
    maxHp:            p.maxHp            ?? p.maxhp        ?? 100,
    hp:               p.hp               ?? 100,
    stats:            p.stats            ?? { strength: 0, agility: 0, defense: 0, vitality: 0 },
    statPoints:       p.statPoints       ?? p.statpoints   ?? 0,
    maxUnlockedZone:  p.maxUnlockedZone  ?? p.maxunlockedzone  ?? 1,
    equippedWeapon:   p.equippedWeapon   ?? p.equippedweapon   ?? 'bamboo_stick',
    arsenal:          p.arsenal          ?? ['bamboo_stick'],
    abilities:        p.abilities        ?? [],
    inventory:        p.inventory        ?? [],
    nftItems:         p.nftItems         ?? p.nftitems     ?? [],
    ubiBuffActive:    p.ubiBuffActive     ?? p.ubibuffactive    ?? false,
    ubiBuffExpiresAt: p.ubiBuffExpiresAt  ?? p.ubibuffexpiresat ?? null,
    activeAbility:    p.activeAbility     ?? p.activeability    ?? null,
    pendingRewards:   p.pendingRewards    ?? p.pendingrewards   ?? [],
    onboarded:        p.onboarded         ?? false,
    zoneProgress:     p.zoneProgress      ?? p.zone_progress ?? {},
    currentZone:      p.currentZone       ?? p.current_zone  ?? null,
    lastProgressSync: p.lastProgressSync  ?? p.lastprogresssync ?? undefined,
  };
}

// Map camelCase PlayerData to the snake_case columns Supabase expects
export function toDbRow(player: PlayerData) {
  return {
    wallet_address:   player.wallet_address,
    name:             player.name,
    hero_class:       player.class,
    skin:             player.skin ?? DEFAULT_SKIN,
    level:            player.level,
    xp:               player.xp,
    gold:             player.gold,
    maxhp:            player.maxHp,
    hp:               player.hp,
    stats:            player.stats,
    statpoints:       player.statPoints,
    maxunlockedzone:  player.maxUnlockedZone,
    equippedweapon:   player.equippedWeapon,
    arsenal:          player.arsenal,
    abilities:        player.abilities,
    inventory:        player.inventory,
    nftitems:         player.nftItems,
    ubibuffactive:    player.ubiBuffActive,
    ubibuffexpiresat: player.ubiBuffExpiresAt,
    activeability:    player.activeAbility ?? null,
    pendingrewards:   player.pendingRewards ?? [],
    onboarded:        player.onboarded ?? false,
    zone_progress:    player.zoneProgress ?? {},
    current_zone:     player.currentZone ?? null,
    lastprogresssync: player.lastProgressSync ?? null,
  };
}

export const dbService = {
  isMocked: !isConfigured,

  // Checks Supabase ONLY — used for wallet auth so localStorage can't ghost-login a player.
  async getPlayerFromDB(walletAddress: string): Promise<PlayerData | null> {
    const address = walletAddress.toLowerCase();
    if (!supabase) return null;
    const { data, error } = await supabase.from('players').select('*').eq('wallet_address', address).maybeSingle();
    if (error || !data) return null;
    return normalizePlayer(data);
  },

  async getPlayer(walletAddress: string): Promise<PlayerData | null> {
    const address = walletAddress.toLowerCase();
    if (supabase) {
      const { data, error } = await supabase.from('players').select('*').eq('wallet_address', address).maybeSingle();
      if (!error && data) return normalizePlayer(data);
    }
    const players = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    return players[address] ? normalizePlayer(players[address]) : null;
  },

  // Writes go through /api/player, which takes the wallet from the signed-in session
  // (see lib/authClient.ts) — the anon key can only read the players table.
  async savePlayer(player: PlayerData): Promise<PlayerData> {
    const address     = player.wallet_address.toLowerCase();
    const cleanPlayer = normalizePlayer({ ...player, wallet_address: address });

    if (supabase) {
      try {
        const res = await fetch('/api/player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanPlayer),
        });
        if (res.ok) {
          const { player: saved } = await res.json();
          if (saved) return normalizePlayer(saved);
        }
        console.warn('Profile save failed, falling back to localStorage', res.status);
      } catch (err) {
        console.warn('Profile save failed, falling back to localStorage', err);
      }
    }

    const players = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    players[address] = cleanPlayer;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(players));
    return cleanPlayer;
  },

  // Record an NFT mint against a player profile (appends to nftItems array)
  async recordNFTMint(walletAddress: string, nftItem: NftItem): Promise<void> {
    const address = walletAddress.toLowerCase();
    const player  = await this.getPlayer(address);
    if (!player) return;

    const alreadyRecorded = player.nftItems.some(n => n.itemId === nftItem.itemId);
    if (alreadyRecorded) return;

    const updated = { ...player, nftItems: [...player.nftItems, nftItem] };
    await this.savePlayer(updated);
  },

  // Save an on-chain progress sync record
  async recordProgressSync(walletAddress: string, level: number, gold: number, txHash: string): Promise<void> {
    const player = await this.getPlayer(walletAddress.toLowerCase());
    if (!player) return;
    const updated = {
      ...player,
      lastProgressSync: { level, gold, txHash, syncedAt: new Date().toISOString() },
    };
    await this.savePlayer(updated);
  },

  async getPlayerByName(name: string): Promise<PlayerData | null> {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return null;
    if (supabase) {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .ilike('name', trimmed)
        .neq('wallet_address', 'local_player')
        .maybeSingle();
      if (!error && data) return normalizePlayer(data);
    }
    // localStorage fallback
    const players = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    const found = Object.values(players).find(
      (p: any) => p.name?.toLowerCase() === trimmed && p.wallet_address !== 'local_player'
    );
    return found ? normalizePlayer(found as any) : null;
  },

  // wallet (lowercase) → player name, for display next to on-chain addresses. Missing wallets are omitted.
  async getPlayerNames(walletAddresses: string[]): Promise<Record<string, string>> {
    const addrs = Array.from(new Set(walletAddresses.map(a => a.toLowerCase())));
    if (!supabase || addrs.length === 0) return {};
    const { data, error } = await supabase.from('players').select('wallet_address, name').in('wallet_address', addrs);
    if (error || !data) return {};
    return Object.fromEntries(data.map((r: any) => [r.wallet_address, r.name]));
  },

  async getLeaderboard(mode: LeaderboardMode = 'single'): Promise<LeaderboardEntry[]> {
    if (supabase) {
      const { data, error } = await supabase.from('leaderboard').select('*').eq('mode', mode).order('score', { ascending: false }).limit(10);
      if (!error && data) return data as LeaderboardEntry[];
    }
    const list: LeaderboardEntry[] = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    return list.filter(e => (e.mode ?? 'single') === mode).sort((a, b) => b.score - a.score).slice(0, 10);
  },
};
