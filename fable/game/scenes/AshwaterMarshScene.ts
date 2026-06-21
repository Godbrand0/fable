import CombatScene, { EnemyConfig } from './CombatScene';

export default class AshwaterMarshScene extends CombatScene {
  protected zoneName = 'Ashwater Marsh';
  protected minLevel = 3;
  protected maxLevel = 5;
  protected tileKey = 'tile_swamp';

  protected regularEnemyConfig: EnemyConfig = {
    key: 'poison_slime',
    name: 'Poison Slime',
    hp: 30,
    speed: 40,
    damage: 12,
    points: 20
  };

  protected bossConfig: EnemyConfig = {
    key: 'swamp_hydra',
    name: 'Swamp Hydra',
    hp: 1800,
    speed: 0,
    damage: 30,
    points: 100,
    isBoss: true
  };

  constructor() {
    super('AshwaterMarshScene');
  }

  create() {
    super.create();

    // Additional Level 2 mechanics: Slow player down slightly in swamp
    if (this.player && this.player.body) {
      // Custom update to decrease speed slightly
      this.time.addEvent({
        delay: 500,
        callback: () => {
          if (this.player && this.player.active) {
            // Apply a slight passive poison tick or slow-down visual
            this.player.setTint(0x8AE234); // slight green tint for swamp
            this.time.delayedCall(150, () => {
              if (this.player && this.player.active) this.player.clearTint();
            });
          }
        },
        loop: true
      });
    }
  }
}
