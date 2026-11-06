import { supabaseAdmin } from './adminSupabase';
import type { LeaderboardMode } from './scoreLedger';

// Server-only writes. These tables are read-only to the browser's anon key, so every
// write here goes through the service-role client from an API route that has already
// checked the caller's session.

export async function getPlayerName(wallet: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin.from('players').select('name').eq('wallet_address', wallet.toLowerCase()).maybeSingle();
  return data?.name ?? null;
}

export async function recordLevelRewardClaim(wallet: string, levelId: number, zone: string, amountGd: number, txHash: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from('level_reward_claims').upsert({
    wallet_address: wallet.toLowerCase(),
    level_id: levelId,
    zone,
    amount_gd: amountGd,
    tx_hash: txHash,
  }, { onConflict: 'wallet_address,level_id' });
}

export async function updateLeaderboard(wallet: string, name: string, score: number, clearIncrement: number, mode: LeaderboardMode): Promise<void> {
  if (!supabaseAdmin) return;
  const address = wallet.toLowerCase();
  const { data } = await supabaseAdmin.from('leaderboard').select('score, zone_clears').eq('wallet_address', address).eq('mode', mode).maybeSingle();
  await supabaseAdmin.from('leaderboard').upsert({
    wallet_address: address,
    mode,
    player_name: name,
    score: Math.max(data?.score || 0, score),
    zone_clears: (data?.zone_clears || 0) + clearIncrement,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'wallet_address,mode' });
}
