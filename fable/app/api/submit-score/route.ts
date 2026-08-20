import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import { FABLE_SCORE_LEDGER_ADDRESS, FABLE_SCORE_LEDGER_ABI, SCORE_LEDGER_MODE, LeaderboardMode } from '../../../lib/scoreLedger';
import { dbService } from '../../../lib/supabaseClient';

const RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';

const serverClient = createPublicClient({ chain: celo, transport: http(RPC) });

// The one place a completed run's score gets submitted — called explicitly by the
// player (a "Submit Score" action at zone-clear / mission-clear), never automatically
// on every kill. Mirrors the score into the display-only Supabase `leaderboard`
// (instant, per-mode) AND, if configured, into the on-chain FableScoreLedger (the
// trustworthy history campaigns pay out against). Same trust model as
// /api/claim-rewards: the server holds ADMIN_PRIVATE_KEY and submits the tx itself —
// no player signature, no attestation.
export async function POST(req: NextRequest) {
  try {
    const { walletAddress, name, mode, zone, score, clearIncrement } = await req.json() as {
      walletAddress: string;
      name: string;
      mode: LeaderboardMode;
      zone: string;
      score: number;
      clearIncrement?: number;
    };

    if (!walletAddress || !name || (mode !== 'single' && mode !== 'multiplayer') || !zone || typeof score !== 'number') {
      return NextResponse.json({ error: 'Missing or invalid walletAddress, name, mode, zone, or score' }, { status: 400 });
    }

    const roundedScore = Math.max(0, Math.floor(score));

    // Off-chain: always write, instantly, for display — this is the fast path the
    // Leaderboard tab reads from.
    await dbService.updateLeaderboard(walletAddress, name, roundedScore, clearIncrement ?? 0, mode);

    const adminKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminKey || !FABLE_SCORE_LEDGER_ADDRESS) {
      // Dev fallback / ledger not deployed yet — leaderboard write above still happened.
      return NextResponse.json({ success: true, mocked: true, onChain: false });
    }

    const adminAccount = privateKeyToAccount(adminKey as `0x${string}`);
    const adminWallet  = createWalletClient({ account: adminAccount, chain: celo, transport: http(RPC) });
    const modeId = SCORE_LEDGER_MODE[mode];

    try {
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
    return NextResponse.json({ error: err.message || 'Score submission failed' }, { status: 500 });
  }
}
