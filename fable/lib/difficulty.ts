// Player-chosen difficulty (Settings → Difficulty). A per-device preference kept in
// localStorage; React and the Phaser scenes share this module, so the game always
// reads the current choice without any extra wiring.
//
// Hard is the full boss fight (moving, charging, summoning, enraging). Normal and
// Easy soften the boss and how hard everything hits you.

export type DifficultyId = 'easy' | 'normal' | 'hard';

export type Difficulty = {
  id: DifficultyId;
  label: string;
  blurb: string;
  /** Multiplier on all damage the player takes. */
  damageTaken: number;
  /** Multiplier on boss HP. */
  bossHp: number;
  /** Multiplier on boss movement (strafing and charge speed). */
  bossSpeed: number;
  /** Multiplier on the time between boss volleys (higher = fewer shots). */
  bossAttackInterval: number;
  /** Multiplier on the time between boss charges (higher = rarer). */
  bossChargeInterval: number;
  /** Imps summoned per wave, and how often (ms). */
  summonCount: number;
  summonInterval: number;
  /** Whether the boss enrages (faster, more shots) below half HP. */
  enrage: boolean;
};

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: {
    id: 'easy', label: 'Easy', blurb: 'Gentle bosses, you take much less damage',
    damageTaken: 0.6, bossHp: 0.7, bossSpeed: 0.75, bossAttackInterval: 1.5, bossChargeInterval: 1.6,
    summonCount: 1, summonInterval: 45000, enrage: false,
  },
  normal: {
    id: 'normal', label: 'Normal', blurb: 'A fair fight',
    damageTaken: 0.85, bossHp: 0.85, bossSpeed: 0.9, bossAttackInterval: 1.2, bossChargeInterval: 1.25,
    summonCount: 2, summonInterval: 35000, enrage: true,
  },
  hard: {
    id: 'hard', label: 'Hard', blurb: 'Full-strength bosses',
    damageTaken: 1, bossHp: 1, bossSpeed: 1, bossAttackInterval: 1, bossChargeInterval: 1,
    summonCount: 2, summonInterval: 30000, enrage: true,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard'];
const STORAGE_KEY = 'fable_difficulty';
const DEFAULT: DifficultyId = 'normal';

let current: DifficultyId | null = null;

export function getDifficultyId(): DifficultyId {
  if (current) return current;
  let stored: string | null = null;
  try { stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null; } catch { /* storage blocked */ }
  current = stored && stored in DIFFICULTIES ? (stored as DifficultyId) : DEFAULT;
  return current;
}

export const getDifficulty = (): Difficulty => DIFFICULTIES[getDifficultyId()];

export function setDifficulty(id: DifficultyId) {
  current = id;
  try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* storage blocked: keep it for this session */ }
}
