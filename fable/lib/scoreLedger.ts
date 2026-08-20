import { parseAbi } from 'viem';

export type LeaderboardMode = 'single' | 'multiplayer';

// Matches FableScoreLedger.sol's `mode` argument (0 = single-player, 1 = multiplayer).
export const SCORE_LEDGER_MODE: Record<LeaderboardMode, number> = {
  single: 0,
  multiplayer: 1,
};

// Set after FableScoreLedger.sol is deployed — undefined until then, at which point
// /api/submit-score and lib/campaigns.ts fall back to a dev/mock response instead
// of throwing.
export const FABLE_SCORE_LEDGER_ADDRESS = (
  process.env.NEXT_PUBLIC_FABLE_SCORE_LEDGER_ADDRESS || ''
) as `0x${string}` | '';

export const FABLE_SCORE_LEDGER_ABI = parseAbi([
  // ── Read ──────────────────────────────────────────────────────────────────
  'function admin() view returns (address)',
  'function currentWeek() view returns (uint256)',
  'function playerBestScore(uint256 week, uint8 mode, address player) view returns (uint256)',
  'function getAllScores(uint256 week, uint8 mode) view returns ((address player, uint256 score, uint256 timestamp)[])',
  // ── Write (admin) ─────────────────────────────────────────────────────────
  'function recordScore(address player, uint8 mode, uint256 score, string zone)',
  'function transferAdmin(address newAdmin)',
  // ── Events ────────────────────────────────────────────────────────────────
  'event ScoreRecorded(address indexed player, uint8 indexed mode, uint256 score, uint256 indexed week, string zone)',
  'event AdminChanged(address indexed oldAdmin, address indexed newAdmin)',
]);
