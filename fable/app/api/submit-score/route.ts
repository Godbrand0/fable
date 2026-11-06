import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import { FABLE_SCORE_LEDGER_ADDRESS, FABLE_SCORE_LEDGER_ABI, SCORE_LEDGER_MODE, LeaderboardMode } from '../../../lib/scoreLedger';
import { getSessionWallet } from '../../../lib/session';
import { getPlayerName, updateLeaderboard } from '../../../lib/serverDb';
import { maxScoreForZone, SINGLE_PLAYER_ZONES, MULTIPLAYER_ZONES } from '../../../lib/scoreLimits';

const RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';

const serverClient = createPublicClient({ chain: celo, transport: http(RPC) });

// The one place a completed run's score gets submitted — called explicitly by the
// player (a "Submit Score" action at zone-clear / mission-clear), never automatically
// on every kill. Mirrors the score into the display-only Supabase `leaderboard`
// (instant, per-mode) AND, if configured, into the on-chain FableScoreLedger (the
// history campaigns pay out against).
//
// Guards, since this feeds real G$ payouts:
//   - the wallet comes from the signed-in session, never the request body;
//   - the zone must belong to the stated mode, and the score can't exceed the most
//     that zone can produce in one run (lib/scoreLimits.ts);
//   - the display name comes from the stored profile, not the request.
export async function POST(req: NextRequest) {
  try {
    const walletAddress = getSessionWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const { mode, zone, score, clearIncrement } = await req.json() as {
      mode: LeaderboardMode;
      zone: string;
      score: number;
      clearIncrement?: number;
    };

    const zonesForMode = mode === 'single' ? SINGLE_PLAYER_ZONES : mode === 'multiplayer' ? MULTIPLAYER_ZONES : null;
    if (!zonesForMode || typeof zone !== 'string' || !zonesForMode.includes(zone) || typeof score !== 'number' || !Number.isFinite(score)) {
      return NextResponse.json({ error: 'Missing or invalid mode, zone, or score' }, { status: 400 });
    }

    const roundedScore = Math.max(0, Math.floor(score));
    const maxScore = maxScoreForZone(zone)!;
    if (roundedScore > maxScore) {
      console.warn(`[submit-score] rejected ${walletAddress}: score ${roundedScore} > max ${maxScore} for ${zone}`);
      return NextResponse.json({ error: 'Score exceeds the maximum possible for this zone' }, { status: 400 });
    }

    const name = await getPlayerName(walletAddress);
    if (!name) {
      return NextResponse.json({ error: 'No player profile for this wallet' }, { status: 404 });
    }

    // Off-chain: always write, instantly, for display — this is the fast path the
    // Leaderboard tab reads from. One submission counts as at most one clear.
    await updateLeaderboard(walletAddress, name, roundedScore, clearIncrement ? 1 : 0, mode);

    const adminKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminKey || !FABLE_SCORE_LEDGER_ADDRESS) {
      // Dev fallback / ledger not deployed yet — leaderboard write above still happened.
      return NextResponse.json({ success: true, mocked: true, onChain: false });
    }

    const adminAccount = privateKeyToAccount(adminKey as `0x${string}`);
    const adminWallet  = createWalletClient({ account: adminAccount, chain: celo, transport: http(RPC) });
    const modeId = SCORE_LEDGER_MODE[mode];

    try {
      // simulateContract fails before any gas is spent when the score doesn't beat
      // this week's personal best, so repeat submissions don't cost the admin wallet.
      const { request } = await serverClient.simulateContract({
        account: adminAccount,
        address: FABLE_SCORE_LEDGER_ADDRESS,
        abi: FABLE_SCORE_LEDGER_ABI,
        functionName: 'recordScore',
        args: [walletAddress as `0x${string}`, modeId, BigInt(roundedScore), zone],
      });
      const hash = await adminWallet.writeContract(request);
      await serverClient.waitForTransactionReceipt({ hash });
      return NextResponse.json({ success: true, mocked: false, onChain: true, txHash: hash });
    } catch (err: any) {
      // The on-chain ledger write is best-effort for campaign eligibility — a failure
      // here (e.g. the score didn't beat this week's personal best, or a transient RPC
      // error) shouldn't block the player from seeing their score on the leaderboard,
      // which already succeeded above.
      console.error('[submit-score] on-chain recordScore failed:', err);
      return NextResponse.json({ success: true, mocked: false, onChain: false });
    }
  } catch (err: any) {
    console.error('[submit-score]', err);
    return NextResponse.json({ error: 'Score submission failed' }, { status: 500 });
  }
}
