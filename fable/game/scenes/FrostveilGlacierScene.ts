import Phaser from 'phaser';
import CombatScene, { EnemyConfig } from './CombatScene';
import { getZone } from '../../lib/zones';

const ZONE = getZone('FrostveilGlacierScene')!;

const WORLD_W = 1440;
const WORLD_H = 1440;
const TILE = 32;

// Blizzard hazard: every BLIZZARD_EVERY ms the screen whites out and the player
// walks at BLIZZARD_SPEED of normal speed for BLIZZARD_MS.
const BLIZZARD_EVERY = 11000;
const BLIZZARD_MS = 3000;
const BLIZZARD_SPEED = 0.6;

export default class FrostveilGlacierScene extends CombatScene {
  protected zoneName = ZONE.name;
  protected minLevel = ZONE.minLevel;
  protected maxLevel = ZONE.maxLevel;
  protected tileKey = 'tile_snow';

  protected regularEnemyConfig: EnemyConfig = {
    key: 'frost_wisp',
    name: 'Frost Wisp',
    hp: 340,
    speed: 45,
    damage: 62,
    points: 45,
  };

  protected bossConfig: EnemyConfig = {
    key: 'glacier_wyrm',
    name: 'Glacier Wyrm',
    hp: 7200,
    speed: 20,
    damage: 88,
    points: 260,
    isBoss: true,
  };

  private blizzardOverlay!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('FrostveilGlacierScene');
  }

  create() {
    super.create();

    this.blizzardOverlay = this.add
      .rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xE6F6FF, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(50);

    this.time.addEvent({ delay: BLIZZARD_EVERY, callback: this.startBlizzard, callbackScope: this, loop: true });
  }

  // Spiralling ring of ice shards — the gaps rotate every volley.
  protected bossAttackPattern() {
    return { interval: 1500, count: 10, shape: 'spiral' as const, speed: 190, shakeChance: 0 };
  }

  protected createBiomeLayout(): void {
    const iceWalls = this.physics.add.staticGroup();

    // ── Three glacier crevasses with two crossings each ───────────────────────
    const crevasseYs = [470, 800, 1090]; // kept below the boss spawn (y≈360) and above the player start
    crevasseYs.forEach((cy, idx) => {
      for (let x = 0; x < WORLD_W; x += TILE) {
        const pct = x / WORLD_W;
        // Crossings alternate sides so the route zig-zags up the glacier.
        const inGap = idx % 2 === 0
          ? (pct >= 0.12 && pct <= 0.21) || (pct >= 0.55 && pct <= 0.64)
          : (pct >= 0.36 && pct <= 0.45) || (pct >= 0.80 && pct <= 0.89);
        if (inGap) continue;

        for (let row = 0; row < 3; row++) {
          const ly = cy + row * TILE;
          this.add.image(x + TILE / 2, ly + TILE / 2, row === 1 ? 'tile_crevasse' : 'tile_ice').setDepth(1);
          const wall = this.physics.add.staticImage(x + TILE / 2, ly + TILE / 2, 'tile_ice');
          wall.setAlpha(0);
          wall.refreshBody();
          iceWalls.add(wall);
        }
      }
    });
    this.physics.add.collider(this.player, iceWalls);
    this.physics.add.collider(this.enemies, iceWalls);

    // ── Frozen ponds (decorative, walkable ice sheets) ────────────────────────
    [
      { x: 220, y: 560, w: 6, h: 3 }, { x: 1080, y: 520, w: 7, h: 3 },
      { x: 480, y: 900, w: 5, h: 3 }, { x: 1180, y: 1220, w: 6, h: 3 },
    ].forEach(({ x, y, w, h }) => {
      this.add.tileSprite(x, y, w * TILE, h * TILE, 'tile_ice').setDepth(0.1).setAlpha(0.55);
    });

    // ── Snowy pines ───────────────────────────────────────────────────────────
    [
      { x: 90, y: 200 }, { x: 260, y: 160 }, { x: 640, y: 220 }, { x: 1250, y: 180 },
      { x: 120, y: 640 }, { x: 760, y: 600 }, { x: 1340, y: 640 },
      { x: 300, y: 980 }, { x: 980, y: 960 }, { x: 1360, y: 980 },
      { x: 120, y: 1300 }, { x: 420, y: 1340 }, { x: 1040, y: 1330 }, { x: 1320, y: 1300 },
    ].forEach(({ x, y }) => this.add.image(x, y, 'snow_pine').setDepth(5).setOrigin(0.5, 1));

    // ── Ice crystal clusters ──────────────────────────────────────────────────
    [
      { x: 420, y: 260 }, { x: 900, y: 240 }, { x: 560, y: 560 }, { x: 1180, y: 840 },
      { x: 200, y: 860 }, { x: 760, y: 1200 }, { x: 1000, y: 620 },
    ].forEach(({ x, y }) => this.add.image(x, y, 'ice_crystal').setDepth(4).setOrigin(0.5, 1));

    // ── Frosted boulders ──────────────────────────────────────────────────────
    [
      { x: 60, y: 460 }, { x: 1380, y: 420 }, { x: 640, y: 820 }, { x: 1300, y: 1120 }, { x: 200, y: 1160 },
    ].forEach(({ x, y }) => {
      this.add.image(x, y, 'rock_large').setDepth(4).setTint(0xB6CCDD);
      this.add.image(x + 22, y + 16, 'rock_medium').setDepth(4).setTint(0xB6CCDD);
    });

    // ── Drifting snow ─────────────────────────────────────────────────────────
    for (let i = 0; i < 60; i++) {
      const flake = this.add.circle(
        Phaser.Math.Between(0, WORLD_W), Phaser.Math.Between(0, WORLD_H),
        Phaser.Math.Between(1, 2), 0xFFFFFF, 0.8,
      ).setDepth(20);
      this.tweens.add({
        targets: flake,
        y: flake.y + 120,
        x: flake.x - 40,
        alpha: 0,
        duration: Phaser.Math.Between(3000, 6000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 4000),
      });
    }
  }

  private startBlizzard() {
    if (this.playerHP <= 0 || this.levelCleared) return;

    this.playerSpeedMultiplier = BLIZZARD_SPEED;
    this.showFloatingText(this.player.x, this.player.y - 24, 'BLIZZARD!', '#B6E0F5');
    this.tweens.add({ targets: this.blizzardOverlay, fillAlpha: 0.35, duration: 400 });

    this.time.delayedCall(BLIZZARD_MS, () => {
      this.playerSpeedMultiplier = 1;
      this.tweens.add({ targets: this.blizzardOverlay, fillAlpha: 0, duration: 600 });
    });
  }
}
