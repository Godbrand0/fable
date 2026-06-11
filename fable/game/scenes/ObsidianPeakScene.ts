import Phaser from 'phaser';
import CombatScene, { EnemyConfig } from './CombatScene';
import gameBridge from '../systems/GameBridge';

const WORLD_W = 1440;
const WORLD_H = 1440;

export default class ObsidianPeakScene extends CombatScene {
  protected zoneName = 'Obsidian Peak';
  protected minLevel = 6;
  protected maxLevel = 8;
  protected tileKey = 'tile_obsidian';

  protected regularEnemyConfig: EnemyConfig = {
    key: 'obsidian_golem',
    name: 'Obsidian Golem',
    hp: 60,
    speed: 30,
    damage: 18,
    points: 35,
  };

  protected bossConfig: EnemyConfig = {
    key: 'fire_demon',
    name: 'Fire Demon',
    hp: 500,
    speed: 25,
    damage: 45,
    points: 200,
    isBoss: true,
  };

  private meteors!: Phaser.Physics.Arcade.Group;

  constructor() {
    super('ObsidianPeakScene');
  }

  create() {
    super.create();

    this.meteors = this.physics.add.group();
    this.physics.add.overlap(this.player, this.meteors, this.hitByMeteor as any, undefined, this);

    this.time.addEvent({
      delay: 2800,
      callback: this.spawnMeteor,
      callbackScope: this,
      loop: true,
    });
  }

  private spawnMeteor() {
    if (this.playerHP <= 0 || this.levelCleared) return;

    // Spawn near player in world coordinates
    const spread = 280;
    const targetX = Phaser.Math.Clamp(
      this.player.x + Phaser.Math.Between(-spread, spread),
      80, WORLD_W - 80
    );
    const targetY = Phaser.Math.Clamp(
      this.player.y + Phaser.Math.Between(-spread, spread),
      80, WORLD_H - 80
    );

    // Red warning indicator at ground target
    const indicator = this.add.circle(targetX, targetY, 22, 0xEF2929, 0.22).setDepth(8);
    indicator.setStrokeStyle(2, 0xCC0000);

    this.time.delayedCall(1400, () => {
      indicator.destroy();
      if (this.playerHP <= 0 || this.levelCleared) return;

      const meteor = this.meteors.create(targetX, targetY - 60, 'enemy_projectile') as any;
      meteor.setScale(3);
      meteor.setVelocity(0, 340);
      meteor.setDepth(9);

      this.time.delayedCall(180, () => {
        if (!meteor?.active) return;

        // Explosion ring
        const exp = this.add.circle(meteor.x, meteor.y, 40, 0xEF2929, 0.45).setDepth(10);
        this.tweens.add({
          targets: exp,
          scaleX: 1.6,
          scaleY: 1.6,
          alpha: 0,
          duration: 350,
          onComplete: () => exp.destroy(),
        });

        const dist = Phaser.Math.Distance.Between(
          this.player.x, this.player.y, meteor.x, meteor.y
        );
        if (dist < 55) {
          this.playerHP = Math.max(0, this.playerHP - 25);
          this.cameras.main.shake(160, 0.015);
          this.cameras.main.flash(100, 150, 0, 0);
          this.showFloatingText(this.player.x, this.player.y - 12, '-25 METEOR', '#EF2929');
          gameBridge.emit('player_health_changed', { hp: this.playerHP });

          if (this.playerHP <= 0) {
            this.player.setVelocity(0);
            this.player.setTint(0x555753);
            gameBridge.emit('player_died', { zone: this.scene.key });
          }
        }

        meteor.destroy();
      });
    });
  }

  private hitByMeteor(player: any, meteor: any) {
    meteor.destroy();
    this.playerHP = Math.max(0, this.playerHP - 20);
    this.cameras.main.shake(100, 0.01);
    this.cameras.main.flash(100, 150, 0, 0);
    gameBridge.emit('player_health_changed', { hp: this.playerHP });

    if (this.playerHP <= 0) {
      player.setVelocity(0);
      player.setTint(0x555753);
      gameBridge.emit('player_died', { zone: this.scene.key });
    }
  }
}
