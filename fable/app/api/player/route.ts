import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { celo } from 'viem/chains';
import { getSessionWallet } from '../../../lib/session';
import { supabaseAdmin } from '../../../lib/adminSupabase';
import { normalizePlayer, toDbRow, PlayerData } from '../../../lib/supabaseClient';
import { FABLE_ITEMS_ADDRESS, FABLE_ITEMS_ABI, GD_ITEMS } from '../../../lib/nft';
import { STARTER_WEAPON_ID } from '../../../lib/weapons';

const RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';
const publicClient = createPublicClient({ chain: celo, transport: http(RPC) });

// Local dev uses mock purchases that never reach the chain, so ownership checks are
// skipped there unless explicitly turned on.
const VALIDATE_NFTS =
  process.env.FABLE_VALIDATE_NFT_OWNERSHIP === 'true' ||
  (process.env.FABLE_VALIDATE_NFT_OWNERSHIP !== 'false' && process.env.NODE_ENV === 'production');

async function ownedItemIds(wallet: string): Promise<Set<string>> {
  const balances = await publicClient.readContract({
    address: FABLE_ITEMS_ADDRESS,
    abi: FABLE_ITEMS_ABI,
    functionName: 'balanceOfBatch',
    args: [GD_ITEMS.map(() => wallet as `0x${string}`), GD_ITEMS.map(i => BigInt(i.tokenId))],
  });
  return new Set(GD_ITEMS.filter((_, idx) => balances[idx] > BigInt(0)).map(i => i.id));
}

// NFT weapons and abilities change combat damage, which feeds scores and campaign
// payouts, so a profile may only list items the wallet actually holds on-chain.
function restrictToOwned(player: PlayerData, owned: Set<string>): PlayerData {
  const arsenal = Array.from(new Set([STARTER_WEAPON_ID, ...player.arsenal.filter(id => owned.has(id))]));
  const abilities = player.abilities.filter(id => owned.has(id));
  return {
    ...player,
    arsenal,
    abilities,
    equippedWeapon: arsenal.includes(player.equippedWeapon) ? player.equippedWeapon : STARTER_WEAPON_ID,
    activeAbility: player.activeAbility && abilities.includes(player.activeAbility) ? player.activeAbility : null,
    nftItems: player.nftItems.filter(n => owned.has(n.itemId)),
  };
}

// Saves the signed-in player's own profile. The wallet always comes from the session
// cookie, never from the body, so nobody can overwrite another player's row.
export async function POST(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  try {
    const body = await req.json();
    let player = normalizePlayer({ ...body, wallet_address: wallet });

    if (VALIDATE_NFTS) {
      player = restrictToOwned(player, await ownedItemIds(wallet));
    }

    const { data, error } = await supabaseAdmin.from('players').upsert(toDbRow(player)).select().single();
    if (error || !data) {
      console.error('[player] save failed:', error);
      return NextResponse.json({ error: 'Save failed' }, { status: 500 });
    }
    return NextResponse.json({ player: normalizePlayer(data) });
  } catch (err: any) {
    console.error('[player]', err);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}
