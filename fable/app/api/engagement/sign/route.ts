import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { publicClient } from '../../../../lib/celo';
import {
  APP_CLAIM_TYPES, EIP712_DOMAIN, ENGAGEMENT_ABI, ENGAGEMENT_APP_ADDRESS, ENGAGEMENT_REWARDS_ADDRESS,
  SIGNATURE_WINDOW_BLOCKS, engagementEnabled,
} from '../../../../lib/engagementRewards';

// Fable's half of an Engagement Rewards claim: an AppClaim signature saying "Fable vouches for this
// player". It's bound to the player's address (the contract checks it against msg.sender), so a
// leaked signature can't be used by anyone else. Before signing we check the wallet is a real Fable
// player and that the contract would pay them, so the key never signs for strangers.

export async function POST(req: NextRequest) {
  try {
    if (!engagementEnabled()) {
      return NextResponse.json({ error: 'Engagement rewards not configured' }, { status: 503 });
    }
    const signerKey = process.env.ENGAGEMENT_SIGNER_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
    if (!signerKey || !signerKey.startsWith('0x')) {
      return NextResponse.json({ error: 'Engagement signer not configured' }, { status: 503 });
    }

    const { walletAddress } = await req.json();
    if (!walletAddress || !isAddress(walletAddress)) {
      return NextResponse.json({ error: 'Invalid walletAddress' }, { status: 400 });
    }
    const user = walletAddress as Address;
    const app = ENGAGEMENT_APP_ADDRESS as Address;

    // Must be a Fable player, not just any verified wallet
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Player lookup unavailable' }, { status: 503 });
    const { data: player } = await createClient(url, key)
      .from('players').select('wallet_address').eq('wallet_address', user.toLowerCase()).maybeSingle();
    if (!player) return NextResponse.json({ error: 'Play a game first to unlock the bonus' }, { status: 403 });

    // The contract's own eligibility check (verified, cooldowns, app approved, budget left).
    // It reverts with a reason, which we pass back so the player sees why.
    try {
      await publicClient.readContract({
        address: ENGAGEMENT_REWARDS_ADDRESS, abi: ENGAGEMENT_ABI, functionName: 'canClaim', args: [app, user],
      });
    } catch (e: any) {
      const reason = e?.shortMessage || e?.message || 'Not eligible';
      return NextResponse.json({ error: reason, notEligible: true }, { status: 403 });
    }

    const account = privateKeyToAccount(signerKey as `0x${string}`);
    const [owner, , , , , , , isRegistered, isApproved, , , , , registeredSigner] = await publicClient.readContract({
      address: ENGAGEMENT_REWARDS_ADDRESS, abi: ENGAGEMENT_ABI, functionName: 'registeredApps', args: [app],
    });
    if (!isRegistered || !isApproved) {
      return NextResponse.json({ error: 'Fable is not approved for engagement rewards yet' }, { status: 503 });
    }
    // The contract accepts a signature from the app address, its owner or its registered signer
    const signer = account.address.toLowerCase();
    if (![app, owner, registeredSigner].some(a => a.toLowerCase() === signer)) {
      console.error('[engagement] signer key is not the app, owner or registered signer');
      return NextResponse.json({ error: 'Engagement signer misconfigured' }, { status: 500 });
    }

    const validUntilBlock = (await publicClient.getBlockNumber()) + SIGNATURE_WINDOW_BLOCKS;
    const appSignature = await account.signTypedData({
      domain: EIP712_DOMAIN,
      types: APP_CLAIM_TYPES,
      primaryType: 'AppClaim',
      message: { app, user, validUntilBlock },
    });

    return NextResponse.json({ appSignature, validUntilBlock: validUntilBlock.toString() });
  } catch (err: any) {
    console.error('[engagement/sign]', err);
    return NextResponse.json({ error: err?.message || 'Signing failed' }, { status: 500 });
  }
}
