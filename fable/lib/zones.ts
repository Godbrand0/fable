// Single source of truth for Fable's single-player zones.
//
// Order matters: a zone unlocks when the one before it is cleared, and
// `maxUnlockedZone` on the player is a 1-based index into this list.
//
// To add a zone:
//   1. Add an entry here.
//   2. Create its Phaser scene in game/scenes/ (extend CombatScene) and add the
//      class to game/scenes/zoneScenes.ts.
//   3. Drop a 1280×720 preview at public/zones/<sceneKey>.png for the Codex.
//   4. To pay G$ for clearing it, pick an unused on-chain `levelId`, call
//      FableItems.setLevelReward(levelId, amount) from the admin wallet, make sure
//      the contract's reward pool can cover it, then set `levelId` and `gdReward`.
//
// This file has no Phaser imports so it's safe to use from server routes too.

export interface ZoneDef {
  sceneKey: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  /** Tailwind text color for the zone's title in the Codex. */
  color: string;
  enemyName: string;
  enemyDesc: string;
  bossName: string;
  bossDesc: string;
  /** FableItems level ID for the on-chain G$ clear reward. Omit for zones that don't pay G$. */
  levelId?: number;
  /** Human-readable G$ reward; must match the contract's setLevelReward value. 0 = no G$ reward. */
  gdReward: number;
}

export const ZONES: readonly ZoneDef[] = [
  {
    sceneKey: 'SunfallDunesScene', name: 'Sunfall Dunes', minLevel: 1, maxLevel: 1, color: 'text-yellow-400',
    enemyName: 'Imp', enemyDesc: 'Weaker desert variant — fast but frail.',
    bossName: 'Sand Wraith', bossDesc: 'Swirling desert spirit guarding the dunes with sweeping sandstorms.',
    levelId: 4, gdReward: 500,
  },
  {
    sceneKey: 'EmberFieldsScene', name: 'Ember Fields', minLevel: 1, maxLevel: 2, color: 'text-red-500',
    enemyName: 'Imp', enemyDesc: 'Standard aggressive fire-spitter. Moves fast but frail.',
    bossName: 'Lava Pumpkin', bossDesc: 'Giant volcanic entity. Shoots heavy rings of magma.',
    levelId: 1, gdReward: 500,
  },
  {
    sceneKey: 'AshwaterMarshScene', name: 'Ashwater Marsh', minLevel: 3, maxLevel: 5, color: 'text-purple-400',
    enemyName: 'Poison Slime', enemyDesc: 'Slow purple gelatin. Spits acidic slowing fluid.',
    bossName: 'Swamp Hydra', bossDesc: 'Three heads spitting multiple poison projectiles in wide arcs.',
    levelId: 2, gdReward: 1000,
  },
  {
    sceneKey: 'ObsidianPeakScene', name: 'Obsidian Peak', minLevel: 6, maxLevel: 8, color: 'text-zinc-300',
    enemyName: 'Obsidian Golem', enemyDesc: 'Slow rocky giant. Blocks 20% of incoming player attacks.',
    bossName: 'Fire Demon', bossDesc: 'Volcanic boss. Shoots high-damage flame pulses and shakes the summit.',
    levelId: 3, gdReward: 2000,
  },
  {
    sceneKey: 'FrostveilGlacierScene', name: 'Frostveil Glacier', minLevel: 9, maxLevel: 11, color: 'text-cyan-300',
    enemyName: 'Frost Wisp', enemyDesc: 'Drifting spirit of living ice. Hurls shards from range.',
    bossName: 'Glacier Wyrm', bossDesc: 'Ancient ice serpent. Spins spiralling storms of ice shards while blizzards slow you down.',
    // No G$ reward yet — see step 4 at the top of this file to enable one.
    gdReward: 0,
  },
  {
    sceneKey: 'StormspireRuinsScene', name: 'Stormspire Ruins', minLevel: 12, maxLevel: 14, color: 'text-sky-400',
    enemyName: 'Storm Sentinel', enemyDesc: 'Rune-forged guardian charged with lightning. Tough and relentless.',
    bossName: 'Thunder Colossus', bossDesc: 'Final boss. Fires dense rings of lightning while bolts strike the ruins around you.',
    // No G$ reward yet — see step 4 at the top of this file to enable one.
    gdReward: 0,
  },
];

export const ZONE_COUNT = ZONES.length;
export const FIRST_ZONE_KEY = ZONES[0].sceneKey;

export function getZone(sceneKey: string): ZoneDef | undefined {
  return ZONES.find(z => z.sceneKey === sceneKey);
}

/** 0-based position in ZONES, or -1 if unknown. */
export function zoneIndex(sceneKey: string): number {
  return ZONES.findIndex(z => z.sceneKey === sceneKey);
}

/** The zone that unlocks after `sceneKey`, or null if it's the last one. */
export function nextZoneKey(sceneKey: string): string | null {
  const i = zoneIndex(sceneKey);
  return i >= 0 && i + 1 < ZONE_COUNT ? ZONES[i + 1].sceneKey : null;
}

/** Display name for a scene key, falling back to the key itself. */
export function zoneName(sceneKey: string): string {
  return getZone(sceneKey)?.name ?? sceneKey;
}

/** `maxUnlockedZone` after clearing `sceneKey` (never lowers it, never exceeds ZONE_COUNT). */
export function unlockedAfterClearing(sceneKey: string, currentMax: number): number {
  const i = zoneIndex(sceneKey);
  if (i < 0) return currentMax;
  return Math.max(currentMax, Math.min(i + 2, ZONE_COUNT));
}

/** Scene key of the furthest zone a player has unlocked (where "Continue" should take them). */
export function furthestUnlockedZoneKey(maxUnlockedZone: number | undefined): string {
  const i = Math.min(Math.max((maxUnlockedZone || 1) - 1, 0), ZONE_COUNT - 1);
  return ZONES[i].sceneKey;
}

/** Zone scene key → on-chain FableItems level ID (only zones that pay G$). */
export const ZONE_LEVEL_IDS: Record<string, number> = Object.fromEntries(
  ZONES.filter(z => z.levelId !== undefined).map(z => [z.sceneKey, z.levelId as number]),
);

/** Zone scene key → human-readable G$ clear reward (only zones that pay G$). */
export const ZONE_LEVEL_REWARDS: Record<string, number> = Object.fromEntries(
  ZONES.filter(z => z.levelId !== undefined && z.gdReward > 0).map(z => [z.sceneKey, z.gdReward]),
);
