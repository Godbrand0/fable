import Phaser from 'phaser';

// Animated hero sprite (human skin + bamboo staff), built from the stills in
// art/hero/source by art/hero/build_hero_sprites.py. Frame indices must match
// the hero_bamboo.json that script writes.
//
// Other skin/weapon combinations still use the single static textures drawn in
// BootScene until they get their own sheets.

export const HERO_SHEET_KEY = 'hero_bamboo';
export const HERO_SHEET_URL = '/sprites/hero_bamboo.png';
export const HERO_FRAME = { width: 96, height: 64 };

/** Static texture keys that the animated sheet replaces. */
const ANIMATED_TEXTURE_KEYS = new Set(['player', 'player_bamboo']);
export const isAnimatedHeroTexture = (textureKey: string) => ANIMATED_TEXTURE_KEYS.has(textureKey);

/** Collision box inside the 96×64 frame: the body, not the staff (body is centered at x=48, feet at y=62). */
export const HERO_BODY = { width: 18, height: 44, offsetX: 39, offsetY: 18 };

export const HERO_ANIM = {
  idle: 'hero_idle',
  walk: 'hero_walk',
  shoot: 'hero_shoot',
  hurt: 'hero_hurt',
  death: 'hero_death',
} as const;

const FRAMES: Record<keyof typeof HERO_ANIM, { frames: number[]; frameRate: number; repeat: number }> = {
  idle:  { frames: [0, 1, 2, 3],          frameRate: 4,  repeat: -1 },
  walk:  { frames: [4, 5, 6, 7, 8, 9],    frameRate: 10, repeat: -1 },
  shoot: { frames: [10, 11, 12, 13],      frameRate: 16, repeat: 0 },
  hurt:  { frames: [14, 15],              frameRate: 10, repeat: 0 },
  death: { frames: [14, 16, 17],          frameRate: 6,  repeat: 0 },
};

export function preloadHeroSheet(scene: Phaser.Scene) {
  scene.load.spritesheet(HERO_SHEET_KEY, HERO_SHEET_URL, { frameWidth: HERO_FRAME.width, frameHeight: HERO_FRAME.height });
}

/** Animations are global to the game, so this only needs to run once (BootScene). */
export function registerHeroAnims(scene: Phaser.Scene) {
  if (!scene.textures.exists(HERO_SHEET_KEY)) return;
  (Object.keys(FRAMES) as (keyof typeof HERO_ANIM)[]).forEach((name) => {
    const key = HERO_ANIM[name];
    if (scene.anims.exists(key)) return;
    const f = FRAMES[name];
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(HERO_SHEET_KEY, { frames: f.frames }),
      frameRate: f.frameRate,
      repeat: f.repeat,
    });
  });
}
