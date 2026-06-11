import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Check if credentials are valid
const isConfigured = supabaseUrl && supabaseAnonKey;

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Mock storage helper for localStorage fallback
const LOCAL_STORAGE_KEY = 'fable_local_players';
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
  arsenal: string[];
  inventory: Array<{ item: string; count: number }>;
  ubiBuffActive: boolean;
  ubiBuffExpiresAt: number | null;
}

export interface LeaderboardEntry {
  wallet_address: string;
  player_name: string;
  zone_clears: number;
  score: number;
}

export const dbService = {
  isMocked: !isConfigured,

  async getPlayer(walletAddress: string): Promise<PlayerData | null> {
    const address = walletAddress.toLowerCase();
    if (supabase) {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('wallet_address', address)
        .single();
      if (!error && data) return data as PlayerData;
    }

    // Local Storage Fallback
    const players = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
    return players[address] || null;
  },

  async savePlayer(player: PlayerData): Promise<PlayerData> {
    const address = player.wallet_address.toLowerCase();
    const cleanPlayer = { ...player, wallet_address: address };

    if (supabase) {
      const { data, error } = await supabase
        .from('players')
        .upsert(cleanPlayer)
        .select()
        .single();
      if (!error && data) return data as PlayerData;
      console.warn('Supabase save failed, writing to localStorage', error);
    }

    // Local Storage Fallback
    const players = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
    players[address] = cleanPlayer;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(players));
    return cleanPlayer;
  },

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('score', { ascending: false })
        .limit(10);
      if (!error && data) return data as LeaderboardEntry[];
    }

    // Local Storage Fallback
    const list: LeaderboardEntry[] = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    return list.sort((a, b) => b.score - a.score).slice(0, 10);
  },

  async updateLeaderboard(walletAddress: string, name: string, score: number, clearIncrement = 0): Promise<void> {
    const address = walletAddress.toLowerCase();
    if (supabase) {
      // First get current
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('wallet_address', address)
        .single();

      const newScore = Math.max((data?.score || 0), score);
      const newClears = (data?.zone_clears || 0) + clearIncrement;

      const { error } = await supabase
        .from('leaderboard')
        .upsert({
          wallet_address: address,
          player_name: name,
          score: newScore,
          zone_clears: newClears,
          updated_at: new Date().toISOString(),
        });
      if (!error) return;
      console.warn('Supabase leaderboard save failed, writing to localStorage', error);
    }

    // Local Storage Fallback
    const list: LeaderboardEntry[] = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    const index = list.findIndex(e => e.wallet_address.toLowerCase() === address);
    
    if (index >= 0) {
      list[index].score = Math.max(list[index].score, score);
      list[index].zone_clears += clearIncrement;
      list[index].player_name = name;
    } else {
      list.push({
        wallet_address: address,
        player_name: name,
        zone_clears: clearIncrement,
        score: score
      });
    }
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list));
  }
};
