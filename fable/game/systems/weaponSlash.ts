import Phaser from 'phaser';
import { TAVERN_WEAPONS } from '../../components/TavernShop';

// The player's attack: the hero swings their weapon and a crescent "slash wave"
// flies out in the aim direction, coloured like the weapon. It travels about as
// far as the old orb did, so difficulty stays the same; each weapon has its own
// small twist (speed, size, burn, pierce).

export type SlashStyle = {
  /** Main colour of the crescent. */
  color: number;
  /** Darker halo behind it. */
  glow: number;
  /** Bright inner edge. */
  core: number;
  speed: number;
  scale: number;
  /** ms before the wave fades out. */
  life: number;
  /** How many extra enemies the wave passes through (0 = stops on the first hit). */
  pierce: number;
  /** Ember: sets enemies alight for two small extra ticks of damage. */
  burn: boolean;
};

export const SLASH_STYLES: Record<string, SlashStyle> = {
  bamboo_stick:        { color: 0x6FD34A, glow: 0x1F6E22, core: 0xE6FFD0, speed: 400, scale: 0.9,  life: 1300, pierce: 0, burn: false },
  iron_sword:          { color: 0xD8E2EC, glow: 0x6D7F94, core: 0xFFFFFF, speed: 370, scale: 1.0,  life: 1400, pierce: 0, burn: false },
  ember_blade:         { color: 0xFF5A1F, glow: 0xA81A06, core: 0xFFE3A0, speed: 360, scale: 1.05, life: 1400, pierce: 0, burn: true },
  obsidian_greatsword: { color: 0x9B5CFF, glow: 0x24113F, core: 0xEADCFF, speed: 320, scale: 1.4,  life: 1500, pierce: 2, burn: false },
};

export const slashStyleFor = (weaponId: string | null | undefined): SlashStyle =>
  SLASH_STYLES[weaponId ?? ''] ?? SLASH_STYLES.bamboo_stick;

export const slashTextureKey = (weaponId: string) => `slash_${weaponId}`;

/**
 * Which weapon a player texture key shows ('player_iron_sword', 'obsidian_iron_sword',
 * 'ember_obsidian_gs' …) — used when only the texture key is sent on a weapon change.
 */
export function weaponIdFromTexture(textureKey: string): string {
  const match = TAVERN_WEAPONS.find((w) => textureKey.endsWith(w.textureKey.replace(/^player_/, '')));
  return match?.id ?? 'bamboo_stick';
}

// Crescent texture: 48×48, convex side facing +x, with its thickest part on the
// texture centre so a centred circle body lines up at any rotation.
const TEX = 48;
const RADIUS = 20;
const THICK = 7;
const SPAN = 1.15; // half-angle of the arc, radians

function crescent(cx: number, cy: number, r: number, thick: number, span: number) {
  const outer: Phaser.Math.Vector2[] = [];
  const inner: Phaser.Math.Vector2[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 - 1;
    const a = t * span;
    const w = thick * Math.pow(1 - t * t, 0.8);
    outer.push(new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    inner.push(new Phaser.Math.Vector2(cx + (r - w) * Math.cos(a), cy + (r - w) * Math.sin(a)));
  }
  return outer.concat(inner.reverse());
}

/** Generates one crescent texture per weapon (textures are global, so once is enough). */
export function registerSlashTextures(scene: Phaser.Scene) {
  const cx = TEX / 2 - (RADIUS - THICK / 2);
  const cy = TEX / 2;
  Object.entries(SLASH_STYLES).forEach(([id, s]) => {
    const key = slashTextureKey(id);
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(s.glow, 0.55);
    g.fillPoints(crescent(cx, cy, RADIUS + 2, THICK + 4, SPAN + 0.08), true);
    g.fillStyle(s.color, 1);
    g.fillPoints(crescent(cx, cy, RADIUS, THICK, SPAN), true);
    g.fillStyle(s.core, 1);
    g.fillPoints(crescent(cx, cy, RADIUS, THICK * 0.35, SPAN * 0.85), true);
    g.generateTexture(key, TEX, TEX);
    g.destroy();
  });
}

/**
 * Sets up a freshly created player projectile as a slash wave: texture, rotation,
 * hit circle, grow-in and fade-out. Returns the style so the caller can set velocity.
 */
export function styleSlash(scene: Phaser.Scene, proj: Phaser.Physics.Arcade.Sprite, weaponId: string, angle: number): SlashStyle {
  const s = slashStyleFor(weaponId);
  const key = slashTextureKey(SLASH_STYLES[weaponId] ? weaponId : 'bamboo_stick');
  if (scene.textures.exists(key)) proj.setTexture(key);
  proj.setRotation(angle);
  const body = proj.body as Phaser.Physics.Arcade.Body;
  body.setCircle(11, TEX / 2 - 11, TEX / 2 - 11);
  proj.setData('slashColor', s.color);
  proj.setData('trail', s.color);
  proj.setData('pierce', s.pierce);
  proj.setData('burn', s.burn);
  proj.setData('hits', new Set());
  proj.setScale(s.scale * 0.45);
  scene.tweens.add({ targets: proj, scaleX: s.scale, scaleY: s.scale, duration: 90, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: proj, alpha: 0.15, delay: s.life * 0.65, duration: s.life * 0.35 });
  return s;
}

/** The swing arc drawn around the hero for a moment as they attack. */
export function swingSwoosh(scene: Phaser.Scene, x: number, y: number, weaponId: string, angle: number, facingRight: boolean) {
  const s = slashStyleFor(weaponId);
  const key = slashTextureKey(SLASH_STYLES[weaponId] ? weaponId : 'bamboo_stick');
  if (!scene.textures.exists(key)) return;
  // Sits just in front of the hero and rolls a little in the swing direction
  // (top to bottom on the side they face) while it flares out.
  const dir = facingRight ? 1 : -1;
  const arc = scene.add.image(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, key)
    .setDepth(9).setAlpha(0.75).setBlendMode(Phaser.BlendModes.ADD)
    .setScale(s.scale * 0.6).setRotation(angle - 0.35 * dir);
  scene.tweens.add({
    targets: arc, rotation: angle + 0.2 * dir, alpha: 0, scaleX: s.scale * 1.25, scaleY: s.scale * 1.25,
    duration: 140, ease: 'Quad.easeOut', onComplete: () => arc.destroy(),
  });
}

/** A coloured flash where a slash connects. */
export function slashImpact(scene: Phaser.Scene, x: number, y: number, color: number) {
  const flash = scene.add.circle(x, y, 5, color, 0.85).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: flash, scaleX: 3, scaleY: 3, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
}
