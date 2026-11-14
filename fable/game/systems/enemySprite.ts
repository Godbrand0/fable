import Phaser from 'phaser';
import { ENEMY_ANIMS, ENEMY_SHEETS } from './enemySpriteManifest';

// Animated enemy sprite sheets (minions and bosses), drawn in code by
// art/enemies/*.py and built by art/enemies/build_enemy_sheets.py. Enemies
// keep their original static texture key (e.g. 'imp') everywhere in the game
// logic; only the rendering switches to the sheet 'enemy_<key>'.

export type EnemyAction = keyof typeof ENEMY_ANIMS; // 'move' | 'attack' | 'hurt' | 'death'

export const enemySheetKey = (key: string) => `enemy_${key}`;
export const enemyAnimKey = (key: string, action: EnemyAction) => `enemy_${key}_${action}`;
export const hasEnemySheet = (key: string) => key in ENEMY_SHEETS;

export function preloadEnemySheets(scene: Phaser.Scene) {
  Object.entries(ENEMY_SHEETS).forEach(([key, f]) => {
    scene.load.spritesheet(enemySheetKey(key), `/sprites/enemy_${key}.png`, { frameWidth: f.frameWidth, frameHeight: f.frameHeight });
  });
}

/** Animations are global to the game, so this only needs to run once (BootScene). */
export function registerEnemyAnims(scene: Phaser.Scene) {
  Object.keys(ENEMY_SHEETS).forEach((key) => {
    const sheet = enemySheetKey(key);
    if (!scene.textures.exists(sheet)) return;
    (Object.keys(ENEMY_ANIMS) as EnemyAction[]).forEach((action) => {
      const k = enemyAnimKey(key, action);
      if (scene.anims.exists(k)) return;
      const a = ENEMY_ANIMS[action];
      scene.anims.create({
        key: k,
        frames: scene.anims.generateFrameNumbers(sheet, { start: a.start, end: a.start + a.count - 1 }),
        frameRate: a.frameRate,
        repeat: a.repeat,
      });
    });
  });
}

/**
 * Switches a freshly created enemy (using its static texture) to its animated
 * sheet. The physics body keeps the static texture's size, bottom-aligned with
 * the art, so hit boxes — and difficulty — stay the same.
 */
export function animateEnemy(scene: Phaser.Scene, enemy: Phaser.Physics.Arcade.Sprite, key: string): boolean {
  const sheet = enemySheetKey(key);
  if (!hasEnemySheet(key) || !scene.textures.exists(sheet)) return false;
  const staticW = enemy.width, staticH = enemy.height;
  enemy.setTexture(sheet, 0);
  const body = enemy.body as Phaser.Physics.Arcade.Body;
  body.setSize(staticW, staticH, false);
  body.setOffset((enemy.width - staticW) / 2, enemy.height - staticH);
  enemy.setData('animKey', key);
  enemy.setData('action', 'move');
  enemy.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
    if (!enemy.active || anim.key === enemyAnimKey(key, 'death')) return;
    enemy.setData('action', 'move');
    enemy.anims.play(enemyAnimKey(key, 'move'), true);
  });
  enemy.anims.play({ key: enemyAnimKey(key, 'move'), startFrame: Phaser.Math.Between(0, 3) });
  return true;
}

/** Plays a one-shot action (attack / hurt) on an animated enemy; attack isn't interrupted by hurt. */
export function playEnemyAction(enemy: any, action: Exclude<EnemyAction, 'move' | 'death'>) {
  const key = enemy?.getData?.('animKey');
  if (!key || !enemy.active) return;
  if (action === 'hurt' && enemy.getData('action') === 'attack') return;
  enemy.setData('action', action);
  enemy.anims.play(enemyAnimKey(key, action), false);
}
