// The highest score a single run of each zone can produce. /api/submit-score rejects
// anything above these, so a forged request can't post an impossible score to the
// on-chain ledger that campaign payouts read.
//
// Derived from the game constants (keep in sync if they change):
//   - CombatScene: requiredDefeatsToBoss = 8, maxConcurrentEnemies = 6. Regular
//     enemies stop spawning once the boss appears, so at most
//     requiredDefeatsToBoss + maxConcurrentEnemies regular kills happen in a run.
//   - Each zone scene's regularEnemyConfig.points and bossConfig.points.
//   - MultiplayerArenaScene, at the largest party (3): requiredDefeatsToBoss = 22,
//     maxConcurrentEnemies = 14, bossLives = 3. Regular spawns resume between boss
//     lives, so the bound allows a full refill of enemies for every life.

interface ZoneScoring { regularPoints: number; bossPoints: number; required: number; maxConcurrent: number; bossLives: number }

const ZONES: Record<string, ZoneScoring> = {
  SunfallDunesScene:     { regularPoints: 8,  bossPoints: 40,  required: 8,  maxConcurrent: 6,  bossLives: 1 },
  EmberFieldsScene:      { regularPoints: 11, bossPoints: 50,  required: 8,  maxConcurrent: 6,  bossLives: 1 },
  AshwaterMarshScene:    { regularPoints: 20, bossPoints: 100, required: 8,  maxConcurrent: 6,  bossLives: 1 },
  ObsidianPeakScene:     { regularPoints: 35, bossPoints: 200, required: 8,  maxConcurrent: 6,  bossLives: 1 },
  MultiplayerArenaScene: { regularPoints: 8,  bossPoints: 60,  required: 22, maxConcurrent: 14, bossLives: 3 },
};

export const SINGLE_PLAYER_ZONES = ['SunfallDunesScene', 'EmberFieldsScene', 'AshwaterMarshScene', 'ObsidianPeakScene'];
export const MULTIPLAYER_ZONES = ['MultiplayerArenaScene'];

/** Max possible score for one run of `zone`, or null if the zone isn't scorable. */
export function maxScoreForZone(zone: string): number | null {
  const z = ZONES[zone];
  if (!z) return null;
  const regularKills = z.required + z.maxConcurrent * z.bossLives;
  return regularKills * z.regularPoints + z.bossPoints * z.bossLives;
}
