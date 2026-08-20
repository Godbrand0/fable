import { createPublicClient, createWalletClient, http, parseAbi, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import { FABLE_SCORE_LEDGER_ADDRESS, FABLE_SCORE_LEDGER_ABI, SCORE_LEDGER_MODE, LeaderboardMode } from './scoreLedger';
import { G$_ADDRESS } from './celo';

const RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';
const publicClient = createPublicClient({ chain: celo, transport: http(RPC) });

const WEEK_SECONDS = 7 * 24 * 60 * 60;

const ERC20_TRANSFER_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

export interface CampaignWinner {
  wallet: string;
  score: bigint;
  timestampMs: number;
}

// The only source campaign payouts trust: every FableScoreLedger.recordScore call
// (only ever admin-executed, via /api/submit-score — see that route) whose block
// timestamp falls inside [startsAtMs, endsAtMs], collapsed to each player's best
// score in that window for the given mode. Deliberately never reads the Supabase
// `leaderboard` table — that table is open/writable from the browser for instant
// display, fine for a display-only leaderboard, not for deciding who gets paid G$.
export async function getCampaignWinners(
  mode: LeaderboardMode,
  startsAtMs: number,
  endsAtMs: number,
  topN: number,
): Promise<CampaignWinner[]> {
  if (!FABLE_SCORE_LEDGER_ADDRESS) throw new Error('NEXT_PUBLIC_FABLE_SCORE_LEDGER_ADDRESS not configured');

  const modeId = SCORE_LEDGER_MODE[mode];
  const startWeek = Math.floor(startsAtMs / 1000 / WEEK_SECONDS);
  const endWeek = Math.floor(endsAtMs / 1000 / WEEK_SECONDS);

  const best = new Map<string, CampaignWinner>();

  for (let week = startWeek; week <= endWeek; week++) {
    const entries = await publicClient.readContract({
      address: FABLE_SCORE_LEDGER_ADDRESS,
      abi: FABLE_SCORE_LEDGER_ABI,
      functionName: 'getAllScores',
      args: [BigInt(week), modeId],
    });

    for (const e of entries as readonly { player: string; score: bigint; timestamp: bigint }[]) {
      const ts = Number(e.timestamp) * 1000;
      if (ts < startsAtMs || ts > endsAtMs) continue;

      const wallet = e.player.toLowerCase();
      const existing = best.get(wallet);
      if (!existing || e.score > existing.score) {
        best.set(wallet, { wallet, score: e.score, timestampMs: ts });
      }
    }
  }

  return Array.from(best.values())
    .sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : a.timestampMs - b.timestampMs))
    .slice(0, topN);
}

export type CampaignMode = LeaderboardMode | 'both';

// Wraps getCampaignWinners for a campaign's stored `mode` column — 'both' merges
// single-player and multiplayer scores into one ranking (each wallet's best across
// either mode), everything else is a straight pass-through.
export async function getCampaignWinnersForMode(
  mode: CampaignMode,
  startsAtMs: number,
  endsAtMs: number,
  topN: number,
): Promise<CampaignWinner[]> {
  if (mode !== 'both') return getCampaignWinners(mode, startsAtMs, endsAtMs, topN);

  const [single, multiplayer] = await Promise.all([
    getCampaignWinners('single', startsAtMs, endsAtMs, topN),
    getCampaignWinners('multiplayer', startsAtMs, endsAtMs, topN),
  ]);

  const best = new Map<string, CampaignWinner>();
  for (const w of [...single, ...multiplayer]) {
    const existing = best.get(w.wallet);
    if (!existing || w.score > existing.score) best.set(w.wallet, w);
  }

  return Array.from(best.values())
    .sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : a.timestampMs - b.timestampMs))
    .slice(0, topN);
}

// Sends `amountGd` (a plain decimal number, rounded to 6dp) of G$ from the admin
// wallet directly to `to` and waits for the receipt — same admin-key-executed
// pattern as /api/claim-rewards, just a plain ERC-20 transfer instead of a
// contract-held reward pool.
export async function sendG$(to: string, amountGd: number): Promise<string> {
  const key = process.env.ADMIN_PRIVATE_KEY;
  if (!key) throw new Error('ADMIN_PRIVATE_KEY not configured');

  const account = privateKeyToAccount(key as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: celo, transport: http(RPC) });

  const hash = await walletClient.writeContract({
    address: G$_ADDRESS,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [to as `0x${string}`, parseUnits(amountGd.toFixed(6), 18)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
