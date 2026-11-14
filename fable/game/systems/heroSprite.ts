import Phaser from 'phaser';

// Animated hero sprite sheets, one per skin × weapon, all with the same 18-frame
// layout. Human: art/hero/build_hero_sprites.py; Stone-kin and Ember-kin:
// art/skins/build_skin_sprites.py. A skin/weapon without a sheet falls back to
// the static texture drawn in BootScene.

export const HERO_FRAME = { width: 96, height: 64 };

/** Static texture key (as returned by getPlayerTextureKey) → animated sheet key. */
const WEAPON_SUFFIXES = ['bamboo', 'iron_sword', 'ember_blade', 'obsidian_gs'];
const ANIMATED_SKINS = ['obsidian', 'ember']; // Stone-kin and Ember-kin (art/skins)
const SHEET_FOR_TEXTURE: Record<string, string> = {
  player: 'hero_bamboo',
  // human skin: 'player_<weapon>' → 'hero_<weapon>'
  ...Object.fromEntries(WEAPON_SUFFIXES.map(w => [`player_${w}`, `hero_${w}`])),
  // other skins: '<skin>_<weapon>' → 'hero_<skin>_<weapon>'
  ...Object.fromEntries(ANIMATED_SKINS.flatMap(sk => WEAPON_SUFFIXES.map(w => [`${sk}_${w}`, `hero_${sk}_${w}`]))),
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
