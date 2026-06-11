# Fable 🗡️

> A mobile-first action RPG powered by GoodDollar's daily UBI on Celo. Explore pixel-art worlds, battle enemies, loot gear — and earn real G$ as you play.

![Version](https://img.shields.io/badge/version-0.1.0-blueviolet)
![Chain](https://img.shields.io/badge/chain-Celo-brightgreen)
![Token](https://img.shields.io/badge/token-G%24-orange)
![Platform](https://img.shields.io/badge/platform-Mobile%20Web-blue)
![Program](https://img.shields.io/badge/GoodBuilders-Season%204-gold)

---

## Table of Contents

- [Overview](#overview)
- [Gameplay](#gameplay)
- [Game World](#game-world)
- [Controls](#controls)
- [Character & Progression](#character--progression)
- [Loadout & Equipment](#loadout--equipment)
- [Inventory System](#inventory-system)
- [Combat Mechanics](#combat-mechanics)
- [G$ Integration](#g-integration)
- [UI Layout](#ui-layout)
- [Navigation Tabs](#navigation-tabs)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Smart Contracts](#smart-contracts)
- [GoodBuilders KPIs](#goodbuilders-kpis)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

## Overview

**Fable** is a browser-based, mobile-first action RPG built on top of GoodDollar's UBI infrastructure on Celo. Players create a character, explore a hand-crafted pixel-art world, fight enemies across multiple biomes, collect loot, and level up — all while interacting with real G$ on-chain.

The core loop is designed around GoodDollar's daily claim mechanic: claiming your daily G$ from the UBI scheme unlocks in-game rewards, making Fable one of the few games where the blockchain moment is not a friction point but a natural part of the play session.

Built for the **GoodBuilders Season 4** program — $50K USD streamed in G$ via Superfluid, run in partnership with Flow State.

---

## Gameplay

Fable is a real-time action RPG with dual-stick controls. The player navigates an isometric/top-down pixel-art world, moving through zones of increasing difficulty, fighting enemies, collecting loot, managing equipment, and spending/earning G$ throughout.

**Core loop:**

```
Daily G$ Claim → Enter Town Hub → Equip Gear → Enter Combat Zone → Kill Enemies
      ↓                                                                     ↓
  In-game buff/chest                                            Gold drops + XP + Loot
      ↓                                                                     ↓
  Spend G$ on gear/upgrades ←──────────────── Level Up + Return to Town ←──┘
```

The session structure is pick-up-and-play friendly — a full run from town to zone clear takes 5–10 minutes, making it compatible with the daily-claim retention model.

---

## Game World

### Town (Hub)

The central hub players return to between runs. Contains:

- **Tavern** — the primary NPC building; enter for quests, story beats, and eventually the daily G$ claim UI
- **Environment** — a mixed desert-lush biome with cacti, palm trees, oasis pools, dirt paths, farmlands, and stone ruins at the edges
- **World navigation** — players walk freely around the hub before entering combat zones via the `Enter TAVERN` / zone portals

The town environment uses a warm isometric tile set with lava seeping in at the borders, hinting at the encroaching danger of nearby combat zones.

### Ember Fields (Lv 1–2)

The first combat zone. A volcanic lava biome with:

- Rivers of lava cutting across the terrain
- Scorched dirt paths winding through rock formations
- Dried-out trees and charred wreckage
- Lava geysers and flame vents as environmental hazards

**Zone label format:** `Zone Name (LvX–Y)` displayed in red at the top of screen during combat.

**Known enemies in Ember Fields:**
- **Lava Pumpkin Boss** — large stone/pumpkin hybrid creature with 100HP, glowing carved face, claw arms. Stationary threat that deals heavy damage at close range.
- **Imp (Lv2)** — small red ember imps, fast-moving, low HP, group in packs. Drop gold and consumables on death.

More zones are planned for later seasons (see Roadmap).

---

## Controls

Fable uses a **dual virtual joystick** layout designed for one-thumb or two-thumb mobile play.

```
┌──────────────────────────────────────┐
│           [ZONE NAME]       [AVATAR] │
│                                      │
│         [ GAME WORLD ]               │
│                                      │
│  [L-STICK]              [R-STICK]    │
│                          [ ABILITY ] │
└──────────────────────────────────────┘
```

| Control | Action |
|---|---|
| **Left joystick** | Move character in all directions |
| **Right joystick** | Attack / aim direction |
| **Ability button** (bottom-right) | Trigger equipped active skill (with cooldown timer) |
| **Tap interactive object** | Context actions — `Enter TAVERN`, pick up loot, open chest |
| **Bottom tab bar** | Open inventory panels without pausing movement |

### Ability Cooldown

The ability button displays a **radial cooldown arc** that depletes and refills. Confirmed cooldown observed: ~4-second cycle. Only one active ability slot is visible in the current build.

---

## Character & Progression

### Character Creation / Selection

On the main screen, the player selects or creates a character. Current build shows:

- **Pixel avatar portrait** (green background, 32×32 style)
- **Character name** (e.g., `Test Run`)
- **Genre tag**: `Action RPG`
- **Version string**: `v2.3.307 · 2d5c88a`
- **PLAY** button (CTA, purple/blue)

### Stats

Stats are tracked in the bottom-right panel labelled `STATS · SKILLS`. The following stat rows are visible with icon indicators:

| Icon | Stat | Observed Default |
|---|---|---|
| ⚔️ Sword | Attack / Physical Damage | 0 |
| ❤️ Heart | HP / Vitality | 0 |
| 🔧 Wrench | Crafting / Repair | 0 |
| 💎 Diamond | Magic / Special | 0 |
| 🌿 Leaf | Nature / Resistance | 0 |
| 💧 Drop | Stamina / Mana | 0 |

Stats scale with equipped gear and level-ups. The panel shows numeric values next to each icon pair.

### Levelling

- **XP gain** shown as floating green `+22 XP` text on kill
- **Level** displayed on the avatar chip in the top-right corner (e.g., `Lv 1`)
- Level-up logic and stat point allocation TBD in v0.2

### Gold (In-Game Currency)

- Displayed as `🪙 [amount]` in the top-right avatar chip
- Starting amount observed: `50`
- Gold earned from kills: `+6G` floating text
- Gold decreases as you spend at the tavern / on gear (observed drop from 50 → 5 during Ember Fields run)

---

## Loadout & Equipment

The **Loadout** panel (bottom-left of HUD) shows equipped gear and active stats.

### Equipment Slots

```
┌─────────────────────────────────────────┐
│  LOADOUT          DMG 24-40  DPS 53.3   │
│  ┌────────┐  ┌────────┐                 │
│  │ AMULET │  │ WEAPON │                 │
│  └────────┘  └────────┘                 │
│     CHEST         LEGS                  │
└─────────────────────────────────────────┘
```

| Slot | Visible in Build | Notes |
|---|---|---|
| Amulet | ✅ | Equippable, shows icon |
| Weapon | ✅ | Bamboo Stick confirmed |
| Chest | ✅ (slot label) | Empty in demo |
| Legs | ✅ (slot label) | Empty in demo |
| Shield | ✅ (slot label) | Listed under SHIELD / AMULET / MELEE row |
| Bag | ✅ (slot label) | Opens inventory panel |

### Confirmed Weapons

**Bamboo Stick**
- Type: `Wood · Sword`
- DMG: `24–40`
- DPS: `53.3`
- Actions: `Equip`, `Lock`, `X (dismiss)`

The item card shows item name, type tags, and a stat summary with action buttons.

---

## Inventory System

The **Bag** panel slides up from the bottom. It has five filter tabs:

| Tab Icon | Category |
|---|---|
| 🔵 Circle | All items |
| ❌ Cross | Consumables / misc |
| 🛡️ Shield | Armor |
| 🗡️ Dagger | Weapons |
| ⛏️ Pickaxe | Materials / crafting |

**Empty state:** `Bag is empty.` with helper text `Tap to open.`

**Confirmed loot items** picked up during Ember Fields run:
- `🔥 Fire item` (x2, then x3, x4, x5) — likely ember/flame consumable
- `🦗 Scorpion/bug item` — dropped by imps

Items stack in the bag with a count badge in the corner of the slot. Tapping an item opens the item detail card with the equip/lock/dismiss UI.

---

## Combat Mechanics

### Real-Time Combat

Combat is fully real-time. The player character auto-attacks when enemies are within weapon range. The right joystick orients the attack direction.

### Damage Numbers

Floating damage numbers appear above enemies on hit:
- White numbers = standard hit (e.g., `15`, `39`)
- Implied crit/special colouring TBD

### BLOCK

A `BLOCK` mechanic is confirmed — blue floating text displays `BLOCK` above the character when an incoming attack is successfully blocked. This appears to be triggered automatically or via directional input (details TBD in implementation docs).

### Enemy HP Bars

Enemies display a yellow HP bar above their sprite. Boss bar observed at `100` HP. Imp enemies have smaller bars scaled to their HP pool.

### Death & Loot

On enemy death:
- Gold coins animate dropping to the ground (`6G` observed)
- Loot items drop and glow for pickup
- XP floats up in green text (`+22 XP`)
- Player auto-collects nearby drops on proximity

---

## G$ Integration

This is where Fable diverges from a standard mobile RPG. G$ is not cosmetic — it is the premium economic layer that gives the game real on-chain stakes.

### Integration Points

**1. Daily UBI Claim → In-Game Reward**

The Tavern contains a `Claim Daily G$` button that calls GoodDollar's `UBIScheme` claim function on Celo. Successfully claiming:
- Grants an in-game daily buff (e.g., +10% XP for the session)
- Unlocks a daily loot chest in the tavern
- Registers the player's wallet as an active daily user (key GoodBuilders KPI)

**2. G$ as Premium Currency**

G$ is the hard-currency layer above soft gold:
- Gear bundles purchasable with G$ at the tavern
- Revive tokens (continue after death in a zone) cost G$
- Stamina refills (extra daily runs) cost G$

**3. G$ Sinks (Deflationary Mechanics)**

- Zone entry fee for higher-tier zones (5 G$ to enter Ember Fields Elite, etc.)
- Crafting fee when combining loot materials into gear
- Cosmetic skins and avatar upgrades

**4. G$ Earning (Controlled Faucet)**

To avoid bot-farming, G$ rewards are capped and structured:
- Soft gold (in-game) is earned freely from mob drops — this is off-chain
- G$ is only distributed at zone completion (not per kill) — one claim per wallet per zone per day
- Weekly leaderboard rewards: top 10 players by zone clears share a G$ prize pool

### Wallet Integration

- **MiniPay** (primary) — Celo's lightweight mobile wallet, largest user base in Africa
- **Valora** (secondary)
- **WalletConnect** (fallback)

### Relevant Contracts (Celo Mainnet)

| Contract | Address |
|---|---|
| GoodDollar (G$) | `0x62B8B11039FcfE5aB0C56E502b836208dA855E96` |
| UBIScheme | `0xAACbaaB8571cbECEB46ba85B5981efDB8928545e` |
| GoodReserveCDai | `0x6C35677206ae073A0f4801B88934Ef0F78b3E355` |

---

## UI Layout

Full portrait layout (`480×1040` native, mobile-first):

```
┌──────────────────────────────┐
│  ← [ZONE NAME]    [AVATAR]   │  ← Top bar: back, zone label, player chip
│                              │     Avatar chip shows: name, level, 🪙 gold
│                              │
│                              │
│       [ GAME VIEWPORT ]      │  ← Isometric world render
│                              │
│                              │
│  [L-JOYSTICK]  [R-JOYSTICK]  │  ← Dual virtual sticks
│                  [ ABILITY ] │  ← Radial cooldown button (bottom-right)
│                    [ CHAT  ] │  ← Chat/emote button
├──────────────────────────────┤
│  [ BAG PANEL ]               │  ← Slides up from bottom
│  Tabs: All | Misc | Armor |  │
│         Weapon | Material    │
│  [ item grid ]               │
├──────────────────────────────┤
│ Bag Friends Codex Journey    │  ← Bottom nav bar (5 tabs + More)
│               Map   More     │
└──────────────────────────────┘
```

**Town-specific additional HUD:**

```
├──────────────────────────────┤
│   [BAG]  LOADOUT  STATS·SKILLS│
│          DMG · DPS           │
│  [Amulet][Weapon]            │
│  CHEST        LEGS           │
└──────────────────────────────┘
```

---

## Navigation Tabs

The bottom tab bar provides access to all game panels:

| Tab | Function |
|---|---|
| **Bag** | Opens inventory panel (all loot, equipment, materials) |
| **Friends** | Social — friend list, co-op invite (future) |
| **Codex** | Encyclopedia — enemy bestiary, item descriptions, lore |
| **Journey** | Quest log / story progression |
| **Map** | World map — zone selection, zone level indicators |
| **More** | Settings, wallet connection, daily claim, leaderboard |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Game Engine | Phaser 3 (WebGL renderer, mobile input plugin) |
| Wallet | MiniPay SDK, WalletConnect v2, Viem |
| Chain | Celo Mainnet |
| Token | GoodDollar (G$) — ERC-20 |
| UBI Claim | GoodDollar UBIScheme contract |
| Streaming | Superfluid (for GoodBuilders G$ stream) |
| Backend | Supabase (player profiles, leaderboard, off-chain gold) |
| Auth | Wallet-based (sign-in with Celo address) |
| Hosting | Vercel / Cloudflare Pages |

---

## Project Structure

```
fable/
├── app/                        # Next.js app router
│   ├── page.tsx                # Entry — character select screen
│   ├── game/
│   │   └── page.tsx            # Phaser game mount
│   └── api/
│       ├── claim/route.ts      # G$ daily claim handler
│       ├── leaderboard/route.ts
│       └── player/route.ts
├── game/                       # Phaser 3 source
│   ├── scenes/
│   │   ├── BootScene.ts        # Asset preload
│   │   ├── MainMenuScene.ts    # Character select
│   │   ├── TownScene.ts        # Hub world
│   │   ├── EmberFieldsScene.ts # Combat zone 1
│   │   └── UIScene.ts          # Persistent HUD overlay
│   ├── entities/
│   │   ├── Player.ts           # Player class, stats, movement
│   │   ├── Enemy.ts            # Base enemy class
│   │   ├── LavaPumpkin.ts      # Boss entity
│   │   └── Imp.ts              # Basic mob
│   ├── systems/
│   │   ├── CombatSystem.ts     # Hit detection, damage, block
│   │   ├── InventorySystem.ts  # Bag, loadout, item management
│   │   ├── LootSystem.ts       # Drop tables, pickup logic
│   │   └── GoldSystem.ts       # Soft currency tracking
│   └── config/
│       └── gameConfig.ts       # Phaser config, resolution, input
├── contracts/                  # Integration ABIs + helpers
│   ├── gooddollar.ts           # G$ ERC-20 ABI
│   └── ubischeme.ts            # Claim function ABI
├── components/
│   ├── WalletConnect.tsx
│   ├── ClaimButton.tsx         # Daily G$ claim UI
│   └── Leaderboard.tsx
├── lib/
│   ├── celo.ts                 # Viem Celo client
│   ├── supabase.ts
│   └── gooddollar.ts           # Claim + balance helpers
├── public/
│   └── assets/
│       ├── sprites/            # Pixel character + enemy sprites
│       ├── tilesets/           # Town + Ember Fields tiles
│       ├── ui/                 # HUD elements, icons, buttons
│       └── audio/              # SFX + ambient tracks
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js `>=18`
- A Celo wallet (MiniPay or Valora recommended for mobile testing)
- Supabase project
- G$ on Celo mainnet (small amount for testing sinks)

### Install

```bash
git clone https://github.com/yourhandle/fable.git
cd fable
npm install
```

### Run Dev Server

```bash
npm run dev
```

Open `http://localhost:3000` on a mobile browser or use Chrome DevTools device emulation at `480×1040`.

### Build

```bash
npm run build
npm start
```

---

## Environment Variables

```env
# Celo RPC
NEXT_PUBLIC_CELO_RPC_URL=https://forno.celo.org

# GoodDollar contracts (Celo Mainnet)
NEXT_PUBLIC_GOODDOLLAR_ADDRESS=0x62B8B11039FcfE5aB0C56E502b836208dA855E96
NEXT_PUBLIC_UBISCHEME_ADDRESS=0xAACbaaB8571cbECEB46ba85B5981efDB8928545e

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

---

## Smart Contracts

Fable does not deploy custom contracts in v0.1. All on-chain interaction is with existing GoodDollar protocol contracts on Celo.

| Interaction | Contract | Function |
|---|---|---|
| Check G$ balance | G$ ERC-20 | `balanceOf(address)` |
| Daily UBI claim | UBIScheme | `claim()` |
| Check claim eligibility | UBIScheme | `checkEntitlement(address)` |
| Transfer G$ (gear purchase) | G$ ERC-20 | `transfer(to, amount)` |

Custom escrow and reward distribution contracts will be introduced in v0.2 for the zone completion G$ payout mechanic.

---

## GoodBuilders KPIs

These are the committed weekly metrics for GoodBuilders Season 4:

| Metric | Target (Week 12) |
|---|---|
| Daily active G$ claimers via Fable | 500 |
| G$ transactions (sinks + rewards) | 2,000 / week |
| G$ volume transacted in-game | 10,000 G$ / week |
| D7 player retention | ≥ 25% |
| Registered wallets | 2,000 |
| Zones cleared (aggregate) | 5,000 / week |

Weekly updates published on Flow State with on-chain evidence (transaction hashes, Dune dashboard).

---

## Roadmap

### v0.1 — GoodBuilders Launch (Weeks 1–4)
- [x] Core game loop (Town → Ember Fields → combat → loot)
- [x] Dual joystick controls
- [x] Bag + Loadout system
- [x] Basic enemy AI (Imp, Lava Pumpkin Boss)
- [ ] MiniPay wallet connect
- [ ] Daily G$ claim → in-game buff
- [ ] Soft gold tracking on Supabase
- [ ] Ember Fields zone complete screen

### v0.2 — Economy Layer (Weeks 5–8)
- [ ] Tavern shop (buy gear with G$)
- [ ] Zone completion G$ reward (1x per wallet per day)
- [ ] Revive system (costs G$)
- [ ] Item crafting (materials → gear, G$ fee)
- [ ] Weekly leaderboard with G$ prize pool

### v0.3 — Expansion (Weeks 9–12)
- [ ] Zone 2: Ashwater Marsh (Lv 3–5)
- [ ] Friends + co-op party system
- [ ] Codex (bestiary + lore)
- [ ] Journey (quest log with G$ quest rewards)
- [ ] Character cosmetics (avatar skins, purchasable with G$)

### Post-Season
- [ ] Zone 3+
- [ ] PvP arena (stake G$, winner takes pool)
- [ ] Guild system
- [ ] Full Superfluid streaming income for top guilds

---

## Contributing

Pull requests welcome. Please open an issue first for any significant change.

```bash
# Branch naming
feat/zone-ashwater-marsh
fix/block-mechanic-hitbox
chore/update-gooddollar-abi
```

For game content contributions (sprites, tilesets, audio), open an issue tagged `[art]` or `[audio]` with a preview.

---

## License

MIT © Godbrand — Built for GoodBuilders Season 4 in partnership with GoodDollar & Flow State.

---

> *Fable is live on Celo. Claim your G$. Enter the world.*
