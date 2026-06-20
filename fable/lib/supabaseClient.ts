import { createClient } from '@supabase/supabase-js';
import { NftItem } from './nft';

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
  lastProgressSync?: {        // last "Commit Progress" on-chain sync
    level: number;
    gold: number;
    txHash: string;
    syncedAt: string;
  };
}

export interface LeaderboardEntry {
  wallet_address: string;
  player_name: string;
  zone_clears: number;
  score: number;
}

// Ensure any loaded player has all expected fields with safe defaults
function withDefaults(p: Partial<PlayerData>): PlayerData {
  return {
    wallet_address: p.wallet_address ?? 'local_player',
    name: p.name ?? 'Hero',
    class: p.class ?? 'knight',
    level: p.level ?? 1,
    xp: p.xp ?? 0,
    gold: p.gold ?? 100,
    maxHp: p.maxHp ?? 130,
    hp: p.hp ?? 130,
    stats: p.stats ?? { strength: 12, agility: 8, defense: 12, vitality: 12 },
    statPoints: p.statPoints ?? 0,
    maxUnlockedZone: p.maxUnlockedZone ?? 1,
    equippedWeapon: p.equippedWeapon ?? 'bamboo_stick',
    arsenal: p.arsenal ?? ['bamboo_stick'],
    abilities: p.abilities ?? [],
    inventory: p.inventory ?? [],
    nftItems: p.nftItems ?? [],
    ubiBuffActive: p.ubiBuffActive ?? false,
    ubiBuffExpiresAt: p.ubiBuffExpiresAt ?? null,
    lastProgressSync: p.lastProgressSync,
  };
}

export const dbService = {
  isMocked: !isConfigured,

  async getPlayer(walletAddress: string): Promise<PlayerData | null> {
    const address = walletAddress.toLowerCase();
    if (supabase) {
      const { data, error } = await supabase.from('players').select('*').eq('wallet_address', address).single();
      if (!error && data) return withDefaults(data as Partial<PlayerData>);
    }
    const players = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    return players[address] ? withDefaults(players[address]) : null;
  },

  async savePlayer(player: PlayerData): Promise<PlayerData> {
    const address     = player.wallet_address.toLowerCase();
    const cleanPlayer = withDefaults({ ...player, wallet_address: address });

    if (supabase) {
      const { data, error } = await supabase.from('players').upsert(cleanPlayer).select().single();
      if (!error && data) return withDefaults(data as Partial<PlayerData>);
      console.warn('Supabase save failed, falling back to localStorage', error);
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

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (supabase) {
      const { data, error } = await supabase.from('leaderboard').select('*').order('score', { ascending: false }).limit(10);
      if (!error && data) return data as LeaderboardEntry[];
    }
    const list: LeaderboardEntry[] = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    return list.sort((a, b) => b.score - a.score).slice(0, 10);
  },

  async updateLeaderboard(walletAddress: string, name: string, score: number, clearIncrement = 0): Promise<void> {
    const address = walletAddress.toLowerCase();
    if (supabase) {
      const { data } = await supabase.from('leaderboard').select('*').eq('wallet_address', address).single();
      await supabase.from('leaderboard').upsert({
        wallet_address: address,
        player_name: name,
        score: Math.max(data?.score || 0, score),
        zone_clears: (data?.zone_clears || 0) + clearIncrement,
        updated_at: new Date().toISOString(),
      });
      return;
    }
    const list: LeaderboardEntry[] = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    const index = list.findIndex(e => e.wallet_address.toLowerCase() === address);
    if (index >= 0) {
      list[index].score      = Math.max(list[index].score, score);
      list[index].zone_clears += clearIncrement;
      list[index].player_name = name;
    } else {
      list.push({ wallet_address: address, player_name: name, zone_clears: clearIncrement, score });
    }
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list));
  },
};
