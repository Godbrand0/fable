import Phaser from 'phaser';

// Animated hero sprite sheets (human skin), one per weapon, built from the
// stills in art/hero/source by art/hero/build_hero_sprites.py. Frame indices
// must match the hero_<weapon>.json files that script writes.
//
// Other skins still use the single static textures drawn in BootScene until
// they get their own stills.

export const HERO_FRAME = { width: 96, height: 64 };

/** Static texture key (as returned by getPlayerTextureKey) → animated sheet key. */
const SHEET_FOR_TEXTURE: Record<string, string> = {
  player: 'hero_bamboo',
  player_bamboo: 'hero_bamboo',
  player_iron_sword: 'hero_iron_sword',
  player_ember_blade: 'hero_ember_blade',
  player_obsidian_gs: 'hero_obsidian_gs',
};
const SHEETS = Array.from(new Set(Object.values(SHEET_FOR_TEXTURE)));

/** The animated sheet for a static hero texture key, or null if that look isn't animated yet. */
export const heroSheetFor = (textureKey: string): string | null => SHEET_FOR_TEXTURE[textureKey] ?? null;

/** Collision box inside the 96×64 frame: the body, not the weapon (body is centered at x=48, feet at y=62). */
export const HERO_BODY = { width: 18, height: 44, offsetX: 39, offsetY: 18 };

export type HeroAction = 'idle' | 'walk' | 'shoot' | 'hurt' | 'death';

/** Animation key for an action on a given sheet, e.g. heroAnim('hero_bamboo', 'walk') → 'hero_bamboo_walk'. */
export const heroAnim = (sheet: string, action: HeroAction) => `${sheet}_${action}`;

const FRAMES: Record<HeroAction, { frames: number[]; frameRate: number; repeat: number }> = {
  idle:  { frames: [0, 1, 2, 3],          frameRate: 4,  repeat: -1 },
  walk:  { frames: [4, 5, 6, 7, 8, 9],    frameRate: 10, repeat: -1 },
  shoot: { frames: [10, 11, 12, 13],      frameRate: 16, repeat: 0 },
  hurt:  { frames: [14, 15],              frameRate: 10, repeat: 0 },
  death: { frames: [14, 16, 17],          frameRate: 6,  repeat: 0 },
};

export function preloadHeroSheets(scene: Phaser.Scene) {
  SHEETS.forEach((key) => {
    scene.load.spritesheet(key, `/sprites/${key}.png`, { frameWidth: HERO_FRAME.width, frameHeight: HERO_FRAME.height });
  });
}

/** Animations are global to the game, so this only needs to run once (BootScene). */
export function registerHeroAnims(scene: Phaser.Scene) {
  SHEETS.forEach((sheet) => {
    if (!scene.textures.exists(sheet)) return;
    (Object.keys(FRAMES) as HeroAction[]).forEach((action) => {
      const key = heroAnim(sheet, action);
      if (scene.anims.exists(key)) return;
      const f = FRAMES[action];
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(sheet, { frames: f.frames }),
        frameRate: f.frameRate,
        repeat: f.repeat,
      });
    });
  });
}
