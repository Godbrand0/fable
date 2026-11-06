# Fable RPG

> A mobile-first action RPG powered by GoodDollar's daily UBI on Celo. Explore pixel-art worlds, battle enemies, loot gear — and earn real G$ as you play.

![Version](https://img.shields.io/badge/version-0.2.0-blueviolet)
![Chain](https://img.shields.io/badge/chain-Celo%20Mainnet-brightgreen)
![Token](https://img.shields.io/badge/token-G%24-orange)
![Platform](https://img.shields.io/badge/platform-Mobile%20Web-blue)
![Contract](https://img.shields.io/badge/contract-0x3939Fb4d-yellow)

---

## Table of Contents

- [Overview](#overview)
- [Onboarding Flow](#onboarding-flow)
- [Gameplay](#gameplay)
- [Game World](#game-world)
- [Controls](#controls)
- [Character & Progression](#character--progression)
- [G$ Integration](#g-integration)
- [NFT Items](#nft-items)
- [Level Rewards](#level-rewards)
- [Profile Tab](#profile-tab)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Security Model](#security-model)
- [Smart Contract](#smart-contract)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Roadmap](#roadmap)

---

## Overview

**Fable** is a browser-based, mobile-first action RPG built on GoodDollar's UBI infrastructure on Celo. Players create a hero, explore hand-crafted pixel-art zones, fight enemies, collect loot, and level up — all while earning and spending real G$ on-chain.

G$ is not a cosmetic layer. It is the premium economic currency:
- **Earn** G$ by completing combat zones (server-verified, one-time per wallet per level)
- **Spend** G$ to buy NFT weapons and abilities as ERC-1155 tokens
- **Claim** daily UBI from GoodDollar to activate an in-game XP/Gold buff
- **Identity-gated** — only GoodDollar-verified humans can earn level rewards

The entire earn-and-spend loop runs on Celo mainnet through a single deployed contract.

---

## Onboarding Flow

```
Splash Screen (10s)
       ↓
   Auth Screen
   ┌──────────────────┬──────────────┐
   │ Google / Wallet  │   Username   │
   └──────────────────┴──────────────┘
        │                    │
   Web3Auth (Google)     Type hero name
   or MetaMask/Valora    → shows which wallet
        │                  owns that hero
   Sign the sign-in       → sign in with it
   message (no gas)
        │
   Profile found?
   ├── Yes → Game ✅
   └── No  → Character Creation → Game ✅
```

### Google / Wallet Sign-In
Google sign-in creates or restores a Web3Auth embedded wallet. Players who already hold G$ can connect MetaMask, Valora or MiniPay instead. The wallet auto-switches to Celo mainnet if the user is on the wrong network.

Either way, the player then signs a short plain-text sign-in message. It sends no transaction and costs no gas. The server checks the signature and sets an httpOnly session cookie bound to that wallet for 7 days. Every server action that pays out or saves data uses the wallet in that cookie (see [Security Model](#security-model)).

### Username Lookup
Typing a hero's name finds the account and shows which wallet owns it. It no longer opens the account by itself, because a name proves nothing. The player then signs in with that Google account or wallet.

### Character Creation
Only reached after wallet connection. Wallet address is stored as the primary key — the profile is permanently linked to that address across all devices.

---

## Gameplay

Fable is a real-time action RPG with dual-stick controls.

**Core loop:**
```
Splash → Auth → Town Hub → Equip Gear → Enter Zone → Kill Enemies
                                ↑                          ↓
                         Spend G$ on NFTs         Gold + XP + Loot drops
                                ↑                          ↓
                         Claim Daily UBI ←── Level Up + Zone Clear → Earn G$
```

A full run from town to zone clear takes 5–10 minutes, compatible with the daily-claim retention model.

---

## Game World

### Town Hub
The central hub between runs. Contains the **Tavern** where players access the NFT item shop and claim daily UBI.

### Ember Fields (Zone 1)
Volcanic lava biome. Enemies: **Imps** (fast, low HP) and **Lava Pumpkin Boss** (100 HP, heavy damage). Reward: **500 G$** on first clear.

### Ashwater Marsh (Zone 2)
Swamp biome with poison mechanics. Enemies: **Poison Slimes** and **Swamp Hydra Boss**. Reward: **1,000 G$** on first clear.

### Obsidian Peak (Zone 3)
Summit volcanic zone — the hardest area. Enemies: **Obsidian Golems** and **Fire Demon Boss**. Reward: **2,000 G$** on first clear.

---

## Controls

Fable uses a **dual virtual joystick** layout for mobile.

| Control | Action |
|---|---|
| Left joystick | Move character |
| Right joystick | Aim / attack direction |
| Ability button | Trigger equipped active skill (cooldown) |
| Bottom tab bar | Open panels without pausing |
| Flee to Town | Exit zone and return to hub |

---

## Character & Progression

### Classes

| Class | HP | Strength | Agility | Defense |
|---|---|---|---|---|
| **Knight** | 130 | 12 | 8 | 12 |
| **Ranger** | 100 | 10 | 15 | 8 |
| **Berserker** | 160 | 16 | 6 | 10 |

### Stats
- **XP** — earned from kills, levels up character
- **Gold** — in-game soft currency, earned from kills, spent on potions
- **Stat Points** — allocated on level-up to Strength, Agility, Defense, Vitality (+15 Max HP per Vitality point)

### Zone Clear Screen
After beating a boss, a zone clear screen shows:
- G$ reward status (claiming / claimed / already claimed / not verified)
- Current HP and potion shop (buy with gold)
- Continue button to next zone

---

## G$ Integration

### Trustless Item Purchases
Users buy NFT items directly via `transferAndCall` on the G$ token — a single transaction that transfers G$ and mints the NFT atomically. No server middleman, no approval step.

```
gToken.transferAndCall(fableItemsAddress, price, abi.encode(tokenId))
  → G$ forwarded to treasury
  → NFT minted to buyer
```

### Level Rewards (Server-Verified)
When a player clears a zone, the reward is queued on their profile. Claiming it from the Bank calls `/api/claim-rewards`, which pays the **signed-in session wallet** only, by calling `grantLevelReward(player, levelId)` on-chain with the admin key. The contract:
1. Checks the player hasn't already claimed this level (`levelClaimed` mapping)
2. Checks the player is GoodDollar-verified (`getWhitelistedRoot` on IdentityV2)
3. Transfers G$ from the reward pool to the player

New levels can be added at any time via `setLevelReward(levelId, amount)` — no redeployment needed.

### Daily UBI Claim
The Profile tab has a **Claim Daily G$ UBI** button that calls `UBIScheme.claim()` on Celo. Successfully claiming activates a 24-hour **+50% XP & Gold buff** in-game.

### GoodDollar Identity
Level rewards require GoodDollar face verification. Unverified players see an orange banner with a link to `wallet.gooddollar.org` to complete verification. Uses `getWhitelistedRoot()` which works for both primary and linked secondary wallets.

---

## NFT Items

All items are ERC-1155 tokens on Celo mainnet. Token ID is the item type — multiple players can own the same item.

| # | Item | Type | Effect | G$ Price |
|---|---|---|---|---|
| 1 | Iron Sword | Weapon | +12 ATK | 2,193 G$ |
| 2 | Ember Blade | Weapon | +15 ATK | 4,386 G$ |
| 3 | Obsidian Greatsword | Weapon | +60 ATK | 6,579 G$ |
| 4 | Fire Nova | Ability | AoE Blast | 8,772 G$ |
| 5 | Poison Cloak | Ability | 10s Slow | 13,158 G$ |
| 6 | Stone Shield | Ability | 20s +DEF | 17,544 G$ |

Metadata: `ipfs://bafybeianypngy35lzwcl6myqx6fzbghknu6iire3ezj4jwsieuy6jlbaxu/`

---

## Level Rewards

| Level | Zone | G$ Reward | USD Value |
|---|---|---|---|
| 1 | Ember Fields | 500 G$ | ~$0.50 |
| 2 | Ashwater Marsh | 1,000 G$ | ~$1.00 |
| 3 | Obsidian Peak | 2,000 G$ | ~$2.00 |

Rewards are claimable **once per wallet address per level**. Protected by both on-chain mapping and GoodDollar identity verification.

---

## Profile Tab

The in-game Profile tab (bottom nav) shows everything about the player in one place:

- **Wallet** — connected address with copy button, or Connect Wallet button
- **G$ Balance** — live on-chain balance with refresh
- **Gold** — in-game token balance
- **Level / Zones Cleared / NFTs Owned** — progress stats
- **Zones cleared** — badges for each cleared zone
- **Weapons** — full arsenal with equipped indicator and NFT gem icon
- **Abilities** — NFT abilities owned
- **Active Buffs** — UBI buff status
- **Claim Daily G$ UBI** — one-tap claim button

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| Game Engine | Phaser 4 (WebGL, mobile input) |
| Blockchain | Viem, Celo Mainnet (chain ID 42220) |
| Token | GoodDollar G$ — ERC-20 + ERC-677 |
| NFTs | ERC-1155 (FableItems contract) |
| Identity | GoodDollar IdentityV2 (`getWhitelistedRoot`) |
| UBI | GoodDollar UBIScheme |
| Database | Supabase (player profiles, leaderboard, reward audit log) |
| Auth | Web3Auth (Google) or injected wallet + signed sign-in message → server session cookie |
| Hosting | Vercel |

---

## Project Structure

```
fable/
├── app/
│   ├── page.tsx                    # Splash → Auth → Character creation → Menu → Game
│   ├── admin/                      # Password-protected campaign dashboard
│   ├── stats/                      # Public stats page
│   └── api/
│       ├── auth/                   # login (verify signature → session), logout, me
│       ├── player/                 # Save the signed-in player's profile
│       ├── claim-rewards/          # Pay zone-clear G$ to the session wallet
│       ├── submit-score/           # Leaderboard + on-chain score ledger (capped)
│       ├── fund-new-wallet/        # One-time CELO gas for new embedded wallets
│       ├── admin/campaigns/        # Create, preview and distribute campaigns
│       ├── nft-metadata/           # ERC-1155 metadata JSON
│       └── stats/                  # Cached public stats
├── components/                     # React UI: HUD, MenuPage, TavernShop, Marketplace,
│   └── multiplayer/                #   BankModal, LevelClearScreen, lobby/mission UI
├── game/                           # Phaser scenes and systems
│   ├── scenes/                     # CombatScene base + Sunfall Dunes, Ember Fields,
│   │                               #   Ashwater Marsh, Obsidian Peak, Multiplayer Arena
│   └── systems/                    # GameBridge (React ↔ Phaser), NetworkBridge (co-op)
├── lib/
│   ├── session.ts                  # Player session cookie (server)
│   ├── authClient.ts               # ensureSession(): sign in from the browser
│   ├── scoreLimits.ts              # Max possible score per zone
│   ├── serverDb.ts                 # Service-role writes (leaderboard, claim log)
│   ├── celo.ts                     # viem client, purchases, UBI claim, signing
│   ├── nft.ts / weapons.ts         # Contract ABI, item and weapon definitions
│   └── supabaseClient.ts           # Profile reads, saves via /api/player
├── supabase_schema.sql             # Full DB schema (fresh database)
├── supabase_migration.sql          # Multiplayer / campaigns migration
└── supabase_migration_security.sql # Locks down RLS, campaign payout locking
```

The Solidity sources for FableItems and FableScoreLedger are not in this repository.

---

## Security Model

The game runs in the browser, so the server treats everything the client sends as untrusted:

- **Wallet sessions.** `/api/auth/login` checks a signed sign-in message (EOA or smart wallet) and issues an HMAC-signed, httpOnly cookie. Routes that pay out or write data use the cookie's wallet and ignore any wallet in the request body.
- **Database.** The anon key can only *read* `players`, `leaderboard` and `level_reward_claims`. Profile saves go through `/api/player`, which only writes the session wallet's row. In production it also removes any NFT weapon or ability the wallet doesn't hold on-chain.
- **Scores.** `/api/submit-score` rejects any score above the most a zone can produce in one run (`lib/scoreLimits.ts`). It takes the display name from the stored profile.
- **Gas funding.** Only for the session wallet, only if it has no balance and no transactions, once per wallet (an atomic insert into `celo_fundings`), and at most `FUNDING_DAILY_CAP` wallets per 24h.
- **Campaign payouts.** Distribution takes a lock on the campaign and reserves each payout row before sending, so a double-click can't pay anyone twice.
- **Admin sessions** are signed with a key derived from `ADMIN_SESSION_SECRET` and `ADMIN_PASSWORD`. Changing either one logs out every admin session.

**Known limit:** combat runs on the client. A player who signs in with their own wallet can still script a zone clear or a score up to the cap without really playing. They are still limited to one reward per level per GoodDollar-verified wallet. Closing that gap fully needs server-run combat or checks on recorded runs.

---

## Smart Contract

**FableItems** — deployed on Celo mainnet

| Field | Value |
|---|---|
| Address | `0x3939Fb4dc682A25c3581AF101f47A9bA6032a5eb` |
| Admin | `0x5Ab64c56Df2d01A0c76534E01b6a06Cd3d79391C` |
| G$ Token | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` |
| Treasury | `0x91487d8BC1B573f0BC6c23dE7BA23d50F49F627B` |
| Identity | `0xC361A6E67822a0EDc17D899227dd9FC50BD62F42` |
| Metadata | `ipfs://bafybeianypngy35lzwcl6myqx6fzbghknu6iire3ezj4jwsieuy6jlbaxu/` |

### Key Functions

| Function | Who | Purpose |
|---|---|---|
| `onTokenTransfer(from, value, data)` | G$ token (user-triggered) | Buy NFT item via transferAndCall |
| `grantLevelReward(player, levelId)` | Admin | Pay G$ reward after zone clear |
| `setLevelReward(levelId, amount)` | Admin | Set reward for a level (no redeploy) |
| `setPrice(tokenId, price)` | Admin | Set item price |
| `setIdentityContract(address)` | Admin | Enable/disable identity check |
| `withdrawRewardPool(amount)` | Admin | Reclaim unspent G$ from reward pool |

### Post-Deploy Setup
After deployment call these as admin:

```
setPrice(1, 2193000000000000000000)   // Iron Sword
setPrice(2, 4386000000000000000000)   // Ember Blade
setPrice(3, 6579000000000000000000)   // Obsidian Greatsword
setPrice(4, 8772000000000000000000)   // Fire Nova
setPrice(5, 13158000000000000000000)  // Poison Cloak
setPrice(6, 17544000000000000000000)  // Stone Shield

setLevelReward(1, 500000000000000000000)   // Ember Fields: 500 G$
setLevelReward(2, 1000000000000000000000)  // Ashwater Marsh: 1000 G$
setLevelReward(3, 2000000000000000000000)  // Obsidian Peak: 2000 G$
```

Then send G$ directly to the contract address to fund the reward pool.

---

## Getting Started

### Prerequisites
- Node.js `>=18`
- pnpm
- A Celo wallet with G$ (MetaMask with Celo mainnet, or MiniPay)
- Supabase project

### Install & Run

```bash
git clone https://github.com/Godbrand0/fable.git
cd fable/fable
pnpm install
pnpm dev
```

Open `http://localhost:3000` — use Chrome DevTools mobile emulation at 480px width.

### Database

For a fresh Supabase project, run `supabase_schema.sql` then `supabase_schema_multiplayer.sql`. For an existing database, run `supabase_migration.sql` if you haven't, then `supabase_migration_security.sql`. Run the security migration **after** deploying the app version that saves through `/api/player`.

---

## Environment Variables

```env
# Celo RPC
NEXT_PUBLIC_CELO_RPC_URL=https://forno.celo.org

# Contracts
NEXT_PUBLIC_FABLE_ITEMS_ADDRESS=0x3939Fb4dc682A25c3581AF101f47A9bA6032a5eb
NEXT_PUBLIC_GOODDOLLAR_ADDRESS=0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A
NEXT_PUBLIC_UBISCHEME_ADDRESS=0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1
NEXT_PUBLIC_IDENTITY_ADDRESS=0xC361A6E67822a0EDc17D899227dd9FC50BD62F42

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Optional
NEXT_PUBLIC_FABLE_SCORE_LEDGER_ADDRESS=
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=
NEXT_PUBLIC_WEB3AUTH_NETWORK=sapphire_devnet

# Server-side (Vercel env, never commit)
ADMIN_PRIVATE_KEY=your_deployer_private_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # required: all DB writes use it
SESSION_SECRET=long_random_string                  # required in production: signs player sessions
ADMIN_PASSWORD=admin_dashboard_password
ADMIN_SESSION_SECRET=another_long_random_string    # required for the admin dashboard
FUNDING_DAILY_CAP=50                               # max new wallets funded with CELO per 24h
# FABLE_VALIDATE_NFT_OWNERSHIP=true|false          # default: on in production, off in dev
```

Generate secrets with `openssl rand -hex 32`.

---

## Roadmap

### Done
- [x] Three combat zones (Ember Fields, Ashwater Marsh, Obsidian Peak)
- [x] Dual joystick controls, boss fights, terrain obstacles
- [x] ERC-1155 NFT contract deployed on Celo mainnet
- [x] Trustless item purchases via G$ `transferAndCall`
- [x] Level rewards — earn G$ on zone clear (GoodDollar identity gated)
- [x] GoodDollar identity verification (`getWhitelistedRoot`)
- [x] Daily UBI claim → +50% XP/Gold buff
- [x] Google (Web3Auth) / wallet onboarding with signed sessions and Supabase persistence
- [x] Profile tab (balance, NFTs, zones, weapons, buffs)
- [x] Auto-switch wallet to Celo mainnet
- [x] Leaderboards (single / co-op) and admin-run G$ campaigns paid from the on-chain score ledger
- [x] Co-op multiplayer arena (2–3 players)
- [x] Player marketplace for NFT items

### Next
- [ ] MiniPay deep integration
- [ ] Additional zones beyond Obsidian Peak
- [ ] Item crafting (combine loot materials, G$ fee)
- [ ] PvP arena (stake G$, winner takes pool)

---

## License

MIT © Godbrand — Built on GoodDollar & Celo.

---

> *Fable is live on Celo. Claim your G$. Enter the world.*
