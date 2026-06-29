import Phaser from 'phaser';
import gameBridge from '../systems/GameBridge';

const WORLD_W = 1440;
const WORLD_H = 1440;

const WEAPON_TEXTURE: Record<string, string> = {
  bamboo_stick:         'player_bamboo',
  iron_sword:           'player_iron_sword',
  ember_blade:          'player_ember_blade',
  obsidian_greatsword:  'player_obsidian_gs',
};
const TILE = 32;

export default class TownScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private joystickDir = { x: 0, y: 0 };
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  // Zone portals
  private portals!: Phaser.Physics.Arcade.StaticGroup;

  // Proximity prompt label
  private promptLabel!: Phaser.GameObjects.Text;
  private tavernZone!: Phaser.Geom.Rectangle;
  private bankZone!: Phaser.Geom.Rectangle;
  private guideZone!: Phaser.Geom.Rectangle;
  private tavernEntered = false;
  private bankEntered = false;
  private guideEntered = false;
  private inDialogue = false;

  // Player config from React
  private maxUnlockedZone = 1;

  // Chickens
  private chickens: Array<{ sprite: Phaser.GameObjects.Rectangle; dx: number; dy: number; timer: number }> = [];

  constructor() {
    super('TownScene');
  }

  init() {
    this.tavernEntered = false;
    this.bankEntered = false;
    this.guideEntered = false;
    this.inDialogue = false;
    gameBridge.emit('request_player_data');
  }

  create() {
    // World + physics bounds
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // Receive player data for zone unlock level and weapon texture
    gameBridge.on('sync_player_data', (data: any) => {
      if (!data) return;
      this.maxUnlockedZone = data.maxUnlockedZone ?? 1;
      const textureKey = WEAPON_TEXTURE[data.equippedWeapon ?? 'bamboo_stick'] ?? 'player_bamboo';
      if (this.player?.active) this.player.setTexture(textureKey);
    });

    // Joystick
    gameBridge.on('joystick_left', (dir: any) => {
      this.joystickDir = dir;
    });

    gameBridge.on('exit_zone', () => {
      // Already in town, no-op
    });

    gameBridge.on('request_scene_info', () => {
      gameBridge.emit('scene_changed', { scene: 'TownScene', title: 'Town Hub' });
    });

    gameBridge.on('weapon_changed', ({ textureKey }: any) => {
      if (this.player?.active) this.player.setTexture(textureKey);
    });

    gameBridge.on('guide_camera_pan', (data: any) => {
      // Stop following player to allow pan
      this.cameras.main.stopFollow();
      if (data.target === 'gates') {
        this.cameras.main.pan(WORLD_W / 2, WORLD_H - 220, 1000, 'Power2');
      } else if (data.target === 'bank') {
        this.cameras.main.pan(200, 110, 1000, 'Power2');
      } else if (data.target === 'tavern') {
        this.cameras.main.pan(720, 110, 1000, 'Power2');
      } else if (data.target === 'guide') {
        this.cameras.main.pan(WORLD_W / 2, WORLD_H / 2 - 20, 1000, 'Power2');
      }
    });

    gameBridge.on('end_guide_talk', () => {
      this.inDialogue = false;
      this.cameras.main.startFollow(this.player, true, 1, 1);
    });

    this.buildGround();
    this.buildBoundaryWalls();
    this.buildBuildings();
    this.buildDecorations();
    this.buildPortals();
    this.buildNPCs();
    this.spawnPlayer();
    this.buildUI();

    // Camera follows player at 2x zoom, tight tracking
    this.cameras.main.setZoom(2);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Keyboard
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    gameBridge.emit('scene_changed', { scene: 'TownScene', title: 'Town Hub' });
  }

  // ─── Ground ──────────────────────────────────────────────────────────────────

  private buildGround() {
    // Base sandy ground covering the full world
    this.add.tileSprite(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 'tile_sandy').setDepth(0);

    // Stone path from Tavern – cols 20–24, rows 7–16
    const stoneT_W = 5 * TILE, stoneT_H = 10 * TILE;
    this.add.tileSprite(20 * TILE + stoneT_W / 2, 7 * TILE + stoneT_H / 2, stoneT_W, stoneT_H, 'tile_stone').setDepth(0.1);

    // Stone path from Bank – cols 5–8, rows 7–14
    const stoneB_W = 4 * TILE, stoneB_H = 8 * TILE;
    this.add.tileSprite(5 * TILE + stoneB_W / 2, 7 * TILE + stoneB_H / 2, stoneB_W, stoneB_H, 'tile_stone').setDepth(0.1);

    // Oasis pool area – cols 4–9, rows 15–21
    const oasisW = 6 * TILE, oasisH = 7 * TILE;
    this.add.tileSprite(4 * TILE + oasisW / 2, 15 * TILE + oasisH / 2, oasisW, oasisH, 'tile_oasis').setDepth(0.1);

    // Grass patches (deterministic noise, rows 8–36 only)
    for (let tx = 0; tx < WORLD_W / TILE; tx++) {
      for (let ty = 8; ty <= 36; ty++) {
        if ((tx * 17 + ty * 11) % 13 < 2) {
          this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile_grass').setDepth(0.15);
        }
      }
    }

    // Scorched strip – rows 40–41 (ty45 = 44, so ty45-4 = 40)
    this.add.tileSprite(WORLD_W / 2, 40 * TILE + TILE, WORLD_W, 2 * TILE, 'tile_scorched').setDepth(0.2);

    // Lava border – bottom 3 rows (rows 42–44)
    this.add.tileSprite(WORLD_W / 2, 42 * TILE + TILE + TILE / 2, WORLD_W, 3 * TILE, 'tile_lava_border').setDepth(0.3);
  }

  private groundTileAt(tx: number, ty: number): string {
    const ty45 = WORLD_H / TILE - 1; // last row index = 44

    // Bottom 4 rows: lava border bleeding in
    if (ty >= ty45 - 2) return 'tile_lava_border';
    if (ty >= ty45 - 4) return 'tile_scorched';

    // Oasis pool area (left-center, tiles 4–9 col, 15–21 row)
    if (tx >= 4 && tx <= 9 && ty >= 15 && ty <= 21) return 'tile_oasis';

    // Stone path from Tavern entrance south toward center
    // Tavern door at world (720,220) = tile (22,6). Stone path cols 20–24, rows 7–16
    if (tx >= 20 && tx <= 24 && ty >= 7 && ty <= 16) return 'tile_stone';
    // Stone path from Bank  (~200,200) = tile (6,6). Cols 5–8, rows 7–14
    if (tx >= 5 && tx <= 8 && ty >= 7 && ty <= 14) return 'tile_stone';

    // Grass patches (deterministic noise)
    const noise = (tx * 17 + ty * 11) % 13;
    if (noise < 2 && ty >= 8 && ty <= 36) return 'tile_grass';

    return 'tile_sandy';
  }

  // ─── Boundary walls (thin invisible physics at world edges) ──────────────────

  private buildBoundaryWalls() {
    // Use collideWorldBounds on player instead of explicit tiles for efficiency
    // but also add decorative rocky outcroppings along the side edges below
  }

  // ─── Buildings ───────────────────────────────────────────────────────────────

  private buildBuildings() {
    // ── Tavern ────────────────────────────────────────────
    // Centre at x=720, top at y=60, size 160×100
    this.drawTavern(720, 110);
    this.tavernZone = new Phaser.Geom.Rectangle(680, 200, 80, 40);

    // ── Bank ──────────────────────────────────────────────
    this.drawBank(200, 110);
    this.bankZone = new Phaser.Geom.Rectangle(168, 185, 64, 30);

    // ── Marketplace (Coming Soon) ─────────────────────────
    this.drawMarketplace(1160, 200);
  }

  private drawTavern(cx: number, cy: number) {
    const g = this.add.graphics().setDepth(3);

    // Shadow
    g.fillStyle(0x000000, 0.18);
    g.fillRect(cx - 76, cy + 52, 156, 16);

    // Stone base
    g.fillStyle(0x7A6A5A);
    g.fillRect(cx - 74, cy - 48, 148, 100);

    // Dark wood walls
    g.fillStyle(0x4A2E18);
    g.fillRect(cx - 72, cy - 46, 144, 96);

    // Wood plank lines
    g.fillStyle(0x3A2210);
    for (let i = 0; i < 9; i++) {
      g.fillRect(cx - 72, cy - 46 + i * 10, 144, 1);
    }

    // Thatched roof
    g.fillStyle(0x7A5A28);
    g.fillTriangle(cx - 84, cy - 46, cx, cy - 100, cx + 84, cy - 46);
    g.fillStyle(0x9A7838);
    g.fillTriangle(cx - 80, cy - 46, cx, cy - 96, cx + 80, cy - 46);
    // Roof thatch rows
    g.fillStyle(0x8A6A2A);
    g.fillRect(cx - 68, cy - 74, 136, 3);
    g.fillRect(cx - 56, cy - 62, 112, 3);

    // Chimney
    g.fillStyle(0x5A4A3A);
    g.fillRect(cx + 30, cy - 96, 18, 30);
    g.fillStyle(0x3A2A1A);
    g.fillRect(cx + 28, cy - 98, 22, 5);
    // Smoke puffs (static circles)
    g.fillStyle(0x888888, 0.4);
    g.fillCircle(cx + 39, cy - 105, 6);
    g.fillStyle(0x999999, 0.25);
    g.fillCircle(cx + 42, cy - 114, 5);

    // Door (yellow glow + dark frame)
    g.fillStyle(0xFFCC44, 0.6);
    g.fillRect(cx - 18, cy + 6, 36, 44);
    g.fillStyle(0x2A1A0A);
    g.fillRect(cx - 16, cy + 8, 32, 40);
    g.fillStyle(0xCC8800, 0.5);
    g.fillRect(cx - 14, cy + 10, 28, 36);
    // Door handle
    g.fillStyle(0xFFCC00);
    g.fillCircle(cx + 10, cy + 30, 2);

    // Lantern left of door
    g.fillStyle(0x8B5C20);
    g.fillRect(cx - 28, cy + 10, 4, 8);
    g.fillStyle(0xFFEE66, 0.8);
    g.fillRect(cx - 30, cy + 18, 8, 10);

    // TAVERN sign
    this.add
      .text(cx, cy - 50, 'TAVERN', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#FFCC44',
        fontStyle: 'bold',
        stroke: '#2A1A00',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(4);
  }

  private drawBank(cx: number, cy: number) {
    const g = this.add.graphics().setDepth(3);

    // Shadow
    g.fillStyle(0x000000, 0.15);
    g.fillRect(cx - 55, cy + 46, 110, 12);

    // Stone walls
    g.fillStyle(0x8A7A6A);
    g.fillRect(cx - 54, cy - 38, 108, 84);
    g.fillStyle(0x6A5A4A);
    g.fillRect(cx - 52, cy - 36, 104, 80);

    // Stone joint pattern
    g.fillStyle(0x5A4A3A);
    g.fillRect(cx - 52, cy - 10, 104, 1);
    g.fillRect(cx - 52, cy + 16, 104, 1);
    g.fillRect(cx - 52, cy + 42, 104, 1);
    g.fillRect(cx - 26, cy - 36, 1, 56);
    g.fillRect(cx + 2, cy - 36, 1, 56);
    g.fillRect(cx + 28, cy - 36, 1, 56);

    // Roof
    g.fillStyle(0x5A4A3A);
    g.fillTriangle(cx - 60, cy - 38, cx, cy - 78, cx + 60, cy - 38);
    g.fillStyle(0x6E5E4E);
    g.fillTriangle(cx - 56, cy - 38, cx, cy - 74, cx + 56, cy - 38);

    // Door
    g.fillStyle(0x2A1A0A);
    g.fillRect(cx - 12, cy + 10, 24, 36);
    g.fillStyle(0xAA8840, 0.5);
    g.fillRect(cx - 10, cy + 12, 20, 32);
    g.fillStyle(0xFFAA00);
    g.fillCircle(cx + 6, cy + 28, 2);

    // BANK sign
    this.add
      .text(cx, cy - 42, 'BANK', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#FFCC44',
        fontStyle: 'bold',
        stroke: '#2A1A00',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(4);
  }

  private drawMarketplace(cx: number, cy: number) {
    const g = this.add.graphics().setDepth(3);

    // Stone base building
    g.fillStyle(0x6A5A4A);
    g.fillRect(cx - 70, cy - 40, 140, 80);
    g.fillStyle(0x4A3A2A);
    g.fillRect(cx - 66, cy - 36, 132, 76);

    // Open-front stall archways
    g.fillStyle(0x2A1A0A);
    g.fillRoundedRect(cx - 50, cy, 30, 40, 15);
    g.fillRoundedRect(cx - 15, cy, 30, 40, 15);
    g.fillRoundedRect(cx + 20, cy, 30, 40, 15);

    // MARKET sign
    this.add
      .text(cx, cy - 45, 'MARKET', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#FFCC44',
        fontStyle: 'bold',
        stroke: '#2A1A00',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(4);

    // Flag pole
    g.fillStyle(0x3A2A1A);
    g.fillRect(cx + 80, cy - 60, 4, 100);

    // COMING SOON banner
    g.fillStyle(0xFF6644);
    g.fillRect(cx + 84, cy - 50, 40, 24);

    this.add
      .text(cx + 104, cy - 38, 'COMING\nSOON', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#FFFFFF',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(4);
  }

  // ─── Decorations ─────────────────────────────────────────────────────────────

  private buildDecorations() {
    // Oasis area palms + water
    this.addPalmTree(160, 460);
    this.addPalmTree(240, 500);
    this.addPalmTree(200, 560);

    // Central-path palms
    this.addPalmTree(560, 380);
    this.addPalmTree(900, 320);

    // Lower-field cacti
    this.addCactus(680, 900);
    this.addCactus(820, 820);
    this.addCactus(1100, 760);
    this.addCactus(340, 860);
    this.addCactus(1200, 900);

    // Rocky outcroppings at edges
    this.addRocks(60, 300);
    this.addRocks(60, 500);
    this.addRocks(60, 700);
    this.addRocks(1360, 280);
    this.addRocks(1370, 520);
    this.addRocks(1350, 740);
    this.addRocks(400, 1100);
    this.addRocks(1000, 1080);

    // Barrels near Tavern
    this.addBarrel(780, 210);
    this.addBarrel(800, 220);
    this.addBarrel(630, 215);

    // Barrels near Bank
    this.addBarrel(260, 175);
    this.addBarrel(275, 185);

    // Lava border glow objects at bottom edge
    for (let x = 0; x < WORLD_W; x += 128) {
      this.add.image(x + 64, WORLD_H - 60, 'lava_glow').setDepth(1).setAlpha(0.6);
    }
  }

  private addPalmTree(x: number, y: number) {
    this.add.image(x, y, 'palm_tree').setDepth(5).setOrigin(0.5, 1);
  }

  private addCactus(x: number, y: number) {
    this.add.image(x, y, 'cactus').setDepth(4).setOrigin(0.5, 1);
  }

  private addRocks(x: number, y: number) {
    this.add.image(x, y, 'rock_large').setDepth(4);
    this.add.image(x + 20, y + 18, 'rock_medium').setDepth(4);
  }

  private addBarrel(x: number, y: number) {
    this.add.image(x, y, 'barrel').setDepth(4).setOrigin(0.5, 1);
  }

  // ─── Portals ──────────────────────────────────────────────────────────────────

  private buildPortals() {
    const g = this.add.graphics().setDepth(3);
    this.portals = this.physics.add.staticGroup();
    const portalY = WORLD_H - 220;

    const portalDefs = [
      {
        key: 'EmberFieldsScene',
        label: 'Ember Fields\n(Lv 1-2)',
        x: 360,
        color: 0xEF2929,
        stroke: 0xCC0000,
        unlock: 1,
      },
      {
        key: 'AshwaterMarshScene',
        label: 'Ashwater Marsh\n(Lv 3-5)',
        x: WORLD_W / 2,
        color: 0x8A5BAA,
        stroke: 0x6A3A8A,
        unlock: 2,
      },
      {
        key: 'ObsidianPeakScene',
        label: 'Obsidian Peak\n(Lv 6-8)',
        x: WORLD_W - 360,
        color: 0x444444,
        stroke: 0x222222,
        unlock: 3,
      },
    ];

    portalDefs.forEach((p) => {
      const locked = this.maxUnlockedZone < p.unlock;

      // Glow halo behind portal
      g.fillStyle(p.color, 0.15);
      g.fillCircle(p.x, portalY, 60);

      // Portal frame
      g.lineStyle(4, p.stroke);
      g.strokeRect(p.x - 40, portalY - 40, 80, 80);
      g.fillStyle(p.color, locked ? 0.15 : 0.35);
      g.fillRect(p.x - 40, portalY - 40, 80, 80);

      // Corner ornaments
      g.fillStyle(p.stroke, 1);
      [[p.x - 44, portalY - 44], [p.x + 36, portalY - 44],
       [p.x - 44, portalY + 36], [p.x + 36, portalY + 36]].forEach(([ox, oy]) => {
        g.fillRect(ox, oy, 8, 8);
      });

      // Label
      this.add
        .text(p.x, portalY, locked ? '🔒\n' + p.label : p.label, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: locked ? '#888888' : '#FFFFFF',
          align: 'center',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(4);

      if (!locked) {
        // Physics body for portal trigger
        const zone = this.physics.add.staticImage(p.x, portalY, 'tile_sandy').setAlpha(0);
        zone.setData('targetScene', p.key);
        zone.refreshBody();
        this.portals.add(zone);
      }
    });
  }

  // ─── NPCs ───────────────────────────────────────────────────────────────────

  private buildNPCs() {
    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2 - 20;

    const g = this.add.graphics().setDepth(4);
    
    // Shadow
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(cx, cy + 12, 20, 10);

    // Body (Robes)
    g.fillStyle(0x2B4C7E);
    g.fillRect(cx - 10, cy - 10, 20, 22);
    
    // Belt
    g.fillStyle(0x8A6A2A);
    g.fillRect(cx - 10, cy, 20, 4);

    // Head
    g.fillStyle(0xFFD3B6);
    g.fillCircle(cx, cy - 16, 8);

    // White beard
    g.fillStyle(0xFFFFFF);
    g.fillTriangle(cx - 6, cy - 10, cx + 6, cy - 10, cx, cy);

    // Guildmaster Thorne Nameplate
    this.add
      .text(cx, cy - 34, 'Guildmaster', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#88CCFF',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.guideZone = new Phaser.Geom.Rectangle(cx - 30, cy - 30, 60, 60);
  }

  // ─── Player ───────────────────────────────────────────────────────────────────

  private spawnPlayer() {
    this.player = this.physics.add.sprite(WORLD_W / 2, WORLD_H / 2 - 80, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(6);
  }

  // ─── UI overlays (scroll-fixed) ───────────────────────────────────────────────

  private buildUI() {
    this.promptLabel = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#FFEE44',
        backgroundColor: '#00000099',
        padding: { x: 6, y: 3 },
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(20)
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  update(time: number, delta: number) {
    this.movePlayer();
    this.checkProximity();
    this.checkPortalOverlap();
    this.animateChickens(delta);
  }

  private movePlayer() {
    this.player.setVelocity(0);
    if (this.inDialogue) return;

    const speed = 120;
    let dx = 0;
    let dy = 0;

    if (this.cursors) {
      if (this.cursors.left?.isDown) dx = -1;
      else if (this.cursors.right?.isDown) dx = 1;
      if (this.cursors.up?.isDown) dy = -1;
      else if (this.cursors.down?.isDown) dy = 1;
    }

    if (Math.abs(this.joystickDir.x) > 0.1 || Math.abs(this.joystickDir.y) > 0.1) {
      dx = this.joystickDir.x;
      dy = this.joystickDir.y;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      this.player.setVelocity((dx / len) * speed, (dy / len) * speed);
      if (dx < 0) this.player.setFlipX(true);
      if (dx > 0) this.player.setFlipX(false);
    }
  }

  private checkProximity() {
    const px = this.player.x;
    const py = this.player.y;
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;

    // Prompt label positioned at top-center of camera viewport
    const labelX = camW / 2;
    const labelY = camH * 0.38;

    // Use a temporary rect for the proximity check — never mutate this.tavernZone
    const tavernProximity = new Phaser.Geom.Rectangle(
      this.tavernZone.x - 24, this.tavernZone.y - 24,
      this.tavernZone.width + 48, this.tavernZone.height + 48
    );
    const nearTavern = this.tavernZone && Phaser.Geom.Rectangle.Contains(tavernProximity, px, py);

    if (nearTavern) {
      this.promptLabel
        .setText('⬆  Enter TAVERN')
        .setPosition(labelX, labelY)
        .setVisible(true);
      if (!this.tavernEntered && this.isTouchingZone(this.tavernZone)) {
        this.tavernEntered = true;
        gameBridge.emit('enter_tavern');
      }
    } else {
      const nearBank = this.bankZone && this.isTouchingZone(
        new Phaser.Geom.Rectangle(
          this.bankZone.x - 30,
          this.bankZone.y - 30,
          this.bankZone.width + 60,
          this.bankZone.height + 60
        )
      );
      if (nearBank) {
        this.promptLabel
          .setText('⬆  Enter BANK')
          .setPosition(labelX, labelY)
          .setVisible(true);
        if (!this.bankEntered && this.isTouchingZone(this.bankZone)) {
          this.bankEntered = true;
          gameBridge.emit('enter_bank');
        }
      } else {
        const nearGuide = this.guideZone && this.isTouchingZone(
          new Phaser.Geom.Rectangle(
            this.guideZone.x - 20,
            this.guideZone.y - 20,
            this.guideZone.width + 40,
            this.guideZone.height + 40
          )
        );
        if (nearGuide) {
          this.promptLabel
            .setText('⬆  Talk to Guildmaster')
            .setPosition(labelX, labelY)
            .setVisible(true);
          if (!this.guideEntered && this.isTouchingZone(this.guideZone)) {
            this.guideEntered = true;
            this.inDialogue = true;
            this.player.setVelocity(0); // stop immediately
            gameBridge.emit('talk_to_guide');
          }
        } else {
          this.promptLabel.setVisible(false);
          this.tavernEntered = false;
          this.bankEntered = false;
          this.guideEntered = false;
        }
      }
    }
  }

  private isTouchingZone(rect: Phaser.Geom.Rectangle): boolean {
    return Phaser.Geom.Rectangle.Contains(rect, this.player.x, this.player.y);
  }

  private checkPortalOverlap() {
    this.portals.getChildren().forEach((child: any) => {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, child.x, child.y
      );
      if (dist < 44) {
        const target = child.getData('targetScene');
        if (target) this.scene.start(target);
      }
    });
  }

  private animateChickens(delta: number) {
    this.chickens.forEach((c) => {
      c.timer += delta;
      if (c.timer > 2000) {
        c.timer = 0;
        c.dx = Phaser.Math.Between(-1, 1);
      }
      c.sprite.x += c.dx * 0.04 * delta;
    });
  }
}
