import Phaser from 'phaser';

// Visual polish shared by every combat zone: particles, hit/death feedback,
// projectile trails, player motion, and per-zone lighting (vignette, colour
// wash, boss glow). Purely cosmetic — nothing here touches gameplay state, so
// it is safe to run on every client in multiplayer.
//
// Mobile budget: ambient particles are capped and only emitted inside the
// camera view; filters (vignette/glow) only run on the WebGL renderer.

type Ambient = 'sand' | 'embers' | 'mist' | 'ash' | 'none' | 'storm' | 'rift';

interface ZoneAtmosphere {
  /** Edge-darkening colour and strength (0–1). */
  vignetteColor: number;
  vignetteStrength: number;
  /** Optional full-screen colour wash (e.g. warm for lava, cold for ice). */
  wash?: { color: number; alpha: number; blend: 'ADD' | 'MULTIPLY' };
  /** Footstep dust colour. */
  dust: number;
  /** Hit sparks / death burst colour. */
  accent: number;
  /** Boss glow colour. */
  bossGlow: number;
  /** Colour of the trail behind enemy projectiles. */
  enemyShot: number;
  ambient: Ambient;
}

const DEFAULT_ATMOSPHERE: ZoneAtmosphere = {
  vignetteColor: 0x000000, vignetteStrength: 0.35,
  dust: 0xC8B48A, accent: 0xFFD27A, bossGlow: 0xFF5522, enemyShot: 0xFF6622, ambient: 'none',
};

const ATMOSPHERES: Record<string, Partial<ZoneAtmosphere>> = {
  SunfallDunesScene: {
    vignetteColor: 0x2A1A05, vignetteStrength: 0.3,
    wash: { color: 0xFFC060, alpha: 0.06, blend: 'ADD' },
    dust: 0xE2C58A, accent: 0xFFE08A, bossGlow: 0xFFCC44, ambient: 'sand',
  },
  EmberFieldsScene: {
    vignetteColor: 0x2A0500, vignetteStrength: 0.42,
    wash: { color: 0xFF5A1A, alpha: 0.07, blend: 'ADD' },
    dust: 0x6E5A50, accent: 0xFF8A2A, bossGlow: 0xFF4400, ambient: 'embers',
  },
  AshwaterMarshScene: {
    vignetteColor: 0x05140A, vignetteStrength: 0.45,
    wash: { color: 0x2E5A3A, alpha: 0.12, blend: 'MULTIPLY' },
    dust: 0x4A6A4A, accent: 0x9BE36A, bossGlow: 0x8AE234, enemyShot: 0x8AE234, ambient: 'mist',
  },
  ObsidianPeakScene: {
    vignetteColor: 0x0A0514, vignetteStrength: 0.5,
    wash: { color: 0xFF3A10, alpha: 0.05, blend: 'ADD' },
    dust: 0x3A3A48, accent: 0xFF6A3A, bossGlow: 0xFF2200, ambient: 'ash',
  },
  FrostveilGlacierScene: {
    vignetteColor: 0x0A2440, vignetteStrength: 0.35,
    wash: { color: 0x9AD4FF, alpha: 0.06, blend: 'ADD' },
    dust: 0xF2F8FC, accent: 0xB6E0F5, bossGlow: 0x5FD3FF, enemyShot: 0x86C5E8, ambient: 'none', // zone already draws its own snowfall
  },
  StormspireRuinsScene: {
    vignetteColor: 0x05081A, vignetteStrength: 0.5,
    wash: { color: 0x2A3A6A, alpha: 0.12, blend: 'MULTIPLY' },
    dust: 0x6B738C, accent: 0xFFE45C, bossGlow: 0x3FA9F5, enemyShot: 0x3FA9F5, ambient: 'storm',
  },
  MultiplayerArenaScene: {
    vignetteColor: 0x0B0414, vignetteStrength: 0.45,
    wash: { color: 0x6A1FBE, alpha: 0.06, blend: 'ADD' },
    dust: 0x5A2AA0, accent: 0xB878FF, bossGlow: 0x9B4DFF, enemyShot: 0xB878FF, ambient: 'rift',
  },
};

export default class ZoneFx {
  private scene: Phaser.Scene;
  private atm: ZoneAtmosphere;
  private webgl: boolean;

  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambient: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private ambientZone = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  private trailTick = 0;
  private vignette: Phaser.GameObjects.Image | null = null;
  private vignetteBase = { x: 1, y: 1 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.atm = { ...DEFAULT_ATMOSPHERE, ...(ATMOSPHERES[scene.scene.key] ?? {}) };
    this.webgl = scene.game.renderer.type === Phaser.WEBGL;
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  create(player: Phaser.GameObjects.Sprite) {
    ZoneFx.ensureTextures(this.scene);
    const s = this.scene;

    this.sparks = s.add.particles(0, 0, 'fx_dot', {
      speed: { min: 50, max: 160 },
      lifespan: { min: 180, max: 340 },
      scale: { start: 1, end: 0 },
      tint: [this.atm.accent, 0xFFFFFF],
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(14);

    this.smoke = s.add.particles(0, 0, 'fx_soft', {
      speed: { min: 10, max: 45 },
      lifespan: { min: 380, max: 620 },
      scale: { start: 0.5, end: 1.4 },
      alpha: { start: 0.55, end: 0 },
      tint: 0xBBBBBB,
      emitting: false,
    }).setDepth(13);

    this.dust = s.add.particles(0, 0, 'fx_soft', {
      follow: player,
      followOffset: { x: 0, y: 20 },
      frequency: 90,
      speedX: { min: -14, max: 14 },
      speedY: { min: -10, max: 2 },
      lifespan: 360,
      scale: { start: 0.35, end: 0.05 },
      alpha: { start: 0.45, end: 0 },
      tint: this.atm.dust,
      emitting: false,
    }).setDepth(5);

    this.trail = s.add.particles(0, 0, 'fx_soft', {
      lifespan: 220,
      scale: { start: 0.45, end: 0 },
      alpha: { start: 0.8, end: 0 },
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(7);

    this.createAmbient();
    this.createLighting();
  }

  private createAmbient() {
    const s = this.scene;
    // Phaser's typings want a Vector2-returning source; Rectangle works at runtime.
    const zone = { type: 'random', source: this.ambientZone } as unknown as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig;
    const base = { emitZone: zone, maxAliveParticles: 40 };
    switch (this.atm.ambient) {
      case 'sand':
        this.ambient = s.add.particles(0, 0, 'fx_dot', {
          ...base, frequency: 140, lifespan: 4000,
          speedX: { min: 20, max: 45 }, speedY: { min: -4, max: 4 },
          scale: { min: 0.3, max: 0.6 }, alpha: { start: 0.5, end: 0 }, tint: 0xF2DCA8,
        });
        break;
      case 'embers':
        this.ambient = s.add.particles(0, 0, 'fx_dot', {
          ...base, frequency: 110, lifespan: 2600,
          speedX: { min: -10, max: 10 }, speedY: { min: -45, max: -20 },
          scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 },
          tint: [0xFF8A2A, 0xFFC04A, 0xFF4A1A], blendMode: 'ADD',
        });
        break;
      case 'mist':
        this.ambient = s.add.particles(0, 0, 'fx_soft', {
          ...base, maxAliveParticles: 14, frequency: 420, lifespan: 5000,
          speedX: { min: 6, max: 16 }, speedY: { min: -3, max: 3 },
          scale: { min: 2.5, max: 4 }, alpha: { start: 0, end: 0.18, ease: 'Sine.easeInOut' }, tint: 0xA8C8B0,
        });
        break;
      case 'ash':
        this.ambient = s.add.particles(0, 0, 'fx_dot', {
          ...base, frequency: 120, lifespan: 3500,
          speedX: { min: -12, max: 8 }, speedY: { min: 12, max: 30 },
          scale: { min: 0.3, max: 0.6 }, alpha: { start: 0.7, end: 0 }, tint: [0x777788, 0xFF6A3A],
        });
        break;
      case 'storm':
        this.ambient = s.add.particles(0, 0, 'fx_streak', {
          ...base, maxAliveParticles: 50, frequency: 40, lifespan: 500,
          speedX: { min: -70, max: -50 }, speedY: { min: 360, max: 420 },
          rotate: 10, alpha: { start: 0.35, end: 0 }, tint: 0x9FB8E8,
        });
        break;
      case 'rift':
        this.ambient = s.add.particles(0, 0, 'fx_dot', {
          ...base, frequency: 130, lifespan: 2400,
          speedX: { min: -8, max: 8 }, speedY: { min: -30, max: -12 },
          scale: { start: 0.6, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: [0xB878FF, 0x9B4DFF], blendMode: 'ADD',
        });
        break;
    }
    this.ambient?.setDepth(19);
  }

  private createLighting() {
    const s = this.scene;
    const cam = s.cameras.main;

    // Colour wash: one screen-sized rectangle pinned to the camera.
    if (this.atm.wash) {
      s.add.rectangle(0, 0, cam.width, cam.height, this.atm.wash.color, this.atm.wash.alpha)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(48)
        .setBlendMode(this.atm.wash.blend === 'ADD' ? Phaser.BlendModes.ADD : Phaser.BlendModes.MULTIPLY);
    }

    // Vignette: a radial-gradient image pinned to the camera. Done as a texture
    // rather than a WebGL filter so it also works on the Canvas renderer (older
    // phones fall back to it) and costs no extra render pass.
    const vKey = `fx_vignette_${this.atm.vignetteColor.toString(16)}_${Math.round(this.atm.vignetteStrength * 100)}`;
    if (!s.textures.exists(vKey)) {
      const tex = s.textures.createCanvas(vKey, 256, 144);
      const ctx = tex?.getContext();
      if (tex && ctx) {
        const c = Phaser.Display.Color.IntegerToColor(this.atm.vignetteColor);
        const grad = ctx.createRadialGradient(128, 72, 40, 128, 72, 150);
        grad.addColorStop(0, `rgba(${c.red},${c.green},${c.blue},0)`);
        grad.addColorStop(0.55, `rgba(${c.red},${c.green},${c.blue},${this.atm.vignetteStrength * 0.35})`);
        grad.addColorStop(1, `rgba(${c.red},${c.green},${c.blue},${Math.min(1, this.atm.vignetteStrength * 1.6)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 144);
        tex.refresh();
      }
    }
    if (s.textures.exists(vKey)) {
      // Centered so it stays on-screen under camera zoom; update() rescales it by 1/zoom.
      this.vignette = s.add.image(cam.width / 2, cam.height / 2, vKey).setScrollFactor(0).setDepth(49);
      this.vignetteBase = { x: cam.width / 256, y: cam.height / 144 };
    }
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────
  update(time: number, player: Phaser.Physics.Arcade.Sprite, moving: boolean, playerShots: Phaser.GameObjects.GameObject[], enemyShots: Phaser.GameObjects.GameObject[]) {
    // Scrollfactor-0 objects still get zoomed, so undo the zoom to keep the
    // vignette exactly screen-sized (the boss entrance tweens the zoom).
    if (this.vignette) {
      const z = this.scene.cameras.main.zoom || 1;
      this.vignette.setScale(this.vignetteBase.x / z, this.vignetteBase.y / z);
    }

    // Keep ambient particles spawning only inside the visible area.
    if (this.ambient) {
      const v = this.scene.cameras.main.worldView;
      this.ambientZone.setTo(v.x - 20, v.y - 20, v.width + 40, v.height + 40);
    }

    // Footstep dust + a light walking bob/tilt on the hero.
    this.dust.emitting = moving;
    if (moving) {
      player.setAngle(Math.sin(time / 70) * 5);
    } else if (player.angle !== 0) {
      player.setAngle(player.angle * 0.7);
      if (Math.abs(player.angle) < 0.3) player.setAngle(0);
    }

    // Projectile trails (every other frame keeps the particle count low).
    this.trailTick = (this.trailTick + 1) % 2;
    if (this.trailTick === 0) {
      for (const p of playerShots as any[]) {
        if (p.active) { this.trail.particleTint = 0x9FD0FF; this.trail.emitParticleAt(p.x, p.y, 1); }
      }
      for (const p of enemyShots as any[]) {
        if (p.active) { this.trail.particleTint = this.atm.enemyShot; this.trail.emitParticleAt(p.x, p.y, 1); }
      }
    }
  }

  // ── One-shot effects ────────────────────────────────────────────────────────
  /** Spawn-in: enemies pop out of a dust puff instead of appearing instantly. */
  enemySpawned(enemy: any) {
    const s = this.scene;
    const targetScale = enemy.scaleX || 1;
    enemy.setScale(targetScale * 0.2).setAlpha(0);
    s.tweens.add({ targets: enemy, scaleX: targetScale, scaleY: targetScale, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.smoke.explode(6, enemy.x, enemy.y + enemy.displayHeight / 3);

    // Idle life: regular enemies sway, bosses breathe.
    if (enemy.isBoss) {
      s.tweens.add({ targets: enemy, scaleX: targetScale * 1.04, scaleY: targetScale * 0.97, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 300 });
    } else {
      s.tweens.add({ targets: enemy, angle: { from: -5, to: 5 }, duration: 260 + Math.random() * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  /** Bullet impact: white flash, sparks and a short knockback on regular enemies. */
  enemyHit(enemy: any, fromX: number, fromY: number) {
    const s = this.scene;
    enemy.setTint(0xFFFFFF).setTintMode(Phaser.TintModes.FILL);
    s.time.delayedCall(70, () => { if (enemy?.active) enemy.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); });
    this.sparks.explode(enemy.isBoss ? 10 : 7, enemy.x, enemy.y);

    if (!enemy.isBoss && enemy.body) {
      const a = Phaser.Math.Angle.Between(fromX, fromY, enemy.x, enemy.y);
      enemy.setVelocity(Math.cos(a) * 220, Math.sin(a) * 220);
      enemy.setData('knockUntil', s.time.now + 90);
    }
  }

  /** Death: a ghost copy spins, shrinks and fades while sparks and smoke burst out. */
  enemyDied(enemy: any) {
    const s = this.scene;
    const ghost = s.add.image(enemy.x, enemy.y, enemy.texture.key)
      .setFlipX(enemy.flipX).setDepth(enemy.depth).setScale(enemy.scaleX);
    ghost.setTint(0xFFFFFF).setTintMode(Phaser.TintModes.FILL);
    s.tweens.add({
      targets: ghost, scaleX: 0, scaleY: 0, angle: Phaser.Math.Between(-200, 200), alpha: 0,
      duration: 320, ease: 'Quad.easeIn', onComplete: () => ghost.destroy(),
    });
    this.sparks.explode(14, enemy.x, enemy.y);
    this.smoke.explode(8, enemy.x, enemy.y);
  }

  /** Boss entrance: zoom punch, glow aura and a shockwave ring. */
  bossSpawned(boss: any) {
    const s = this.scene;
    const cam = s.cameras.main;
    const baseZoom = cam.zoom;
    cam.shake(400, 0.012);
    s.tweens.add({ targets: cam, zoom: baseZoom * 0.85, duration: 350, yoyo: true, hold: 500, ease: 'Sine.easeInOut' });
    this.shockwave(boss.x, boss.y, this.atm.bossGlow, 140);

    if (this.webgl) {
      try {
        boss.enableFilters();
        const glow = boss.filters.internal.addGlow(this.atm.bossGlow, 4, 0, 1, false, 10, 8);
        s.tweens.add({ targets: glow, outerStrength: { from: 2, to: 6 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } catch { /* cosmetic only */ }
    }
  }

  /** Boss death: chained explosions and a big shockwave. */
  bossDied(x: number, y: number) {
    const s = this.scene;
    s.cameras.main.shake(600, 0.02);
    for (let i = 0; i < 5; i++) {
      s.time.delayedCall(i * 120, () => {
        const ox = x + Phaser.Math.Between(-30, 30);
        const oy = y + Phaser.Math.Between(-30, 30);
        this.sparks.explode(18, ox, oy);
        this.smoke.explode(10, ox, oy);
      });
    }
    this.shockwave(x, y, this.atm.bossGlow, 220);
  }

  /** Zone clear: a ring of gold sparks around the hero. */
  zoneCleared(x: number, y: number) {
    this.shockwave(x, y, 0xFFD700, 160);
    this.sparks.explode(30, x, y);
  }

  /** Coins pop out with a bounce and keep a gentle glint until picked up. */
  coinDropped(coin: any) {
    const s = this.scene;
    coin.setScale(0.2);
    s.tweens.add({ targets: coin, scaleX: 1, scaleY: 1, duration: 300, ease: 'Back.easeOut' });
    s.tweens.add({ targets: coin, alpha: { from: 1, to: 0.6 }, duration: 450, yoyo: true, repeat: -1, delay: Math.random() * 400 });
  }

  coinCollected(x: number, y: number) {
    this.sparks.explode(6, x, y);
  }

  /** Player takes damage: brief red flash on the hero. */
  playerHurt(player: any) {
    player.setTint(0xFF4444).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(90, () => { if (player?.active) player.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); });
  }

  private shockwave(x: number, y: number, color: number, radius: number) {
    const s = this.scene;
    const ring = s.add.circle(x, y, 10, color, 0).setStrokeStyle(3, color, 0.9).setDepth(15);
    s.tweens.add({ targets: ring, radius, alpha: 0, duration: 500, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  // ── Particle textures (white, tinted per effect) ────────────────────────────
  static ensureTextures(scene: Phaser.Scene) {
    const make = (key: string, w: number, h: number, fn: (g: Phaser.GameObjects.Graphics) => void) => {
      if (scene.textures.exists(key)) return;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      fn(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    make('fx_dot', 4, 4, (g) => { g.fillStyle(0xFFFFFF); g.fillRect(1, 0, 2, 4); g.fillRect(0, 1, 4, 2); });
    make('fx_soft', 16, 16, (g) => {
      g.fillStyle(0xFFFFFF, 0.25); g.fillCircle(8, 8, 8);
      g.fillStyle(0xFFFFFF, 0.45); g.fillCircle(8, 8, 5);
      g.fillStyle(0xFFFFFF, 0.8);  g.fillCircle(8, 8, 2);
    });
    make('fx_streak', 2, 12, (g) => { g.fillStyle(0xFFFFFF); g.fillRect(0, 0, 2, 12); });
  }
}
