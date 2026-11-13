import Phaser from 'phaser';
import CombatScene, { EnemyConfig } from './CombatScene';
import { getZone } from '../../lib/zones';
import gameBridge from '../systems/GameBridge';

const ZONE = getZone('StormspireRuinsScene')!;

const WORLD_W = 1440;
const WORLD_H = 1440;
const TILE = 32;

// Lightning hazard: a strike lands near the player every STRIKE_EVERY ms after a
// STRIKE_WARN_MS warning ring, hitting for STRIKE_DAMAGE within STRIKE_RADIUS px.
const STRIKE_EVERY = 3400;
const STRIKE_WARN_MS = 1200;
const STRIKE_DAMAGE = 30;
const STRIKE_RADIUS = 50;

export default class StormspireRuinsScene extends CombatScene {
  protected zoneName = ZONE.name;
  protected minLevel = ZONE.minLevel;
  protected maxLevel = ZONE.maxLevel;
  protected tileKey = 'tile_ruins';

  protected regularEnemyConfig: EnemyConfig = {
    key: 'storm_sentinel',
    name: 'Storm Sentinel',
    hp: 450,
    speed: 55,
    damage: 72,
    points: 55,
  };

  protected bossConfig: EnemyConfig = {
    key: 'thunder_colossus',
    name: 'Thunder Colossus',
    hp: 9800,
    speed: 22,
    damage: 96,
    points: 330,
    isBoss: true,
  };

  constructor() {
    super('StormspireRuinsScene');
  }

  create() {
    super.create();
    this.time.addEvent({ delay: STRIKE_EVERY, callback: this.callLightning, callbackScope: this, loop: true });
  }

  // Dense, fast rings of lightning that shake the ruins.
  protected bossAttackPattern() {
    return { interval: 1100, count: 12, shape: 'ring' as const, speed: 215, shakeChance: 0.3 };
  }

  protected createBiomeLayout(): void {
    const ruinWalls = this.physics.add.staticGroup();

    // Solid ruin wall segment from (tx, ty) running `len` tiles horizontally or vertically.
    const wallRun = (tx: number, ty: number, len: number, vertical = false) => {
      for (let i = 0; i < len; i++) {
        const x = (vertical ? tx : tx + i) * TILE + TILE / 2;
        const y = (vertical ? ty + i : ty) * TILE + TILE / 2;
        this.add.image(x, y, 'tile_ruin_wall').setDepth(1);
        const wall = this.physics.add.staticImage(x, y, 'tile_ruin_wall');
        wall.setAlpha(0);
        wall.refreshBody();
        ruinWalls.add(wall);
      }
    };

    // ── Outer courtyard walls with breaches (kept clear of the player start
    // at the bottom-center and the boss arena at the top-right) ─────────────
    wallRun(3, 33, 12);  wallRun(30, 33, 12);          // lower terrace, gap in the middle
    wallRun(5, 23, 9);   wallRun(18, 23, 6);  wallRun(31, 23, 9);   // middle terrace, two gaps
    wallRun(2, 13, 10);  wallRun(16, 13, 5);             // upper terrace (boss side left open)
    // Vertical fragments that break up the terraces
    wallRun(14, 24, 5, true);  wallRun(29, 24, 5, true);
    wallRun(8, 14, 5, true);   wallRun(38, 5, 6, true);

    this.physics.add.collider(this.player, ruinWalls);
    this.physics.add.collider(this.enemies, ruinWalls);

    // ── Broken pillars lining the old avenues ─────────────────────────────────
    [
      { x: 200, y: 280 }, { x: 420, y: 300 }, { x: 640, y: 250 },
      { x: 120, y: 620 }, { x: 560, y: 640 }, { x: 900, y: 620 }, { x: 1320, y: 600 },
      { x: 240, y: 960 }, { x: 640, y: 980 }, { x: 1040, y: 960 }, { x: 1300, y: 1000 },
      { x: 160, y: 1320 }, { x: 1280, y: 1330 },
    ].forEach(({ x, y }) => this.add.image(x, y, 'ruin_pillar').setDepth(5).setOrigin(0.5, 1));

    // ── Rubble piles ──────────────────────────────────────────────────────────
    [
      { x: 330, y: 470 }, { x: 760, y: 440 }, { x: 1200, y: 470 }, { x: 420, y: 820 },
      { x: 1120, y: 820 }, { x: 300, y: 1200 }, { x: 980, y: 1220 }, { x: 1380, y: 880 },
    ].forEach(({ x, y }) => this.add.image(x, y, 'ruin_rubble').setDepth(3));

    // ── Glowing storm runes on the floor ──────────────────────────────────────
    [
      { x: 720, y: 560 }, { x: 360, y: 1100 }, { x: 1100, y: 1120 }, { x: 260, y: 160 }, { x: 1180, y: 200 },
    ].forEach(({ x, y }) => {
      const rune = this.add.circle(x, y, 18, 0x3FA9F5, 0.25).setDepth(0.2);
      rune.setStrokeStyle(2, 0xBDE6FF, 0.6);
      this.tweens.add({
        targets: rune,
        alpha: { from: 0.15, to: 0.5 },
        duration: 1100 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  private callLightning() {
    if (this.playerHP <= 0 || this.levelCleared) return;

    const spread = 240;
    const tx = Phaser.Math.Clamp(this.player.x + Phaser.Math.Between(-spread, spread), 60, WORLD_W - 60);
    const ty = Phaser.Math.Clamp(this.player.y + Phaser.Math.Between(-spread, spread), 60, WORLD_H - 60);

    // Warning ring that tightens before the strike
    const warn = this.add.circle(tx, ty, STRIKE_RADIUS, 0xFFE45C, 0.15).setDepth(8);
    warn.setStrokeStyle(2, 0xFFE45C, 0.9);
    this.tweens.add({ targets: warn, scaleX: 0.4, scaleY: 0.4, duration: STRIKE_WARN_MS });

    this.time.delayedCall(STRIKE_WARN_MS, () => {
      warn.destroy();
      if (this.playerHP <= 0 || this.levelCleared) return;

      const bolt = this.add.image(tx, ty, 'lightning_bolt').setOrigin(0.5, 1).setDepth(12).setScale(1.4);
      const flash = this.add.circle(tx, ty, STRIKE_RADIUS, 0xE8F7FF, 0.55).setDepth(11);
      this.tweens.add({ targets: [bolt, flash], alpha: 0, duration: 300, onComplete: () => { bolt.destroy(); flash.destroy(); } });

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, tx, ty);
      if (dist < STRIKE_RADIUS) {
        this.playerHP = Math.max(0, this.playerHP - STRIKE_DAMAGE);
        this.cameras.main.shake(150, 0.012);
        this.cameras.main.flash(100, 255, 240, 120);
        this.showFloatingText(this.player.x, this.player.y - 12, `-${STRIKE_DAMAGE} LIGHTNING`, '#FFE45C');
        gameBridge.emit('player_health_changed', { hp: this.playerHP });
        if (this.playerHP <= 0) this.playerDied();
      }
    });
  }
}
