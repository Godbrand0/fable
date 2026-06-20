import { parseAbi } from 'viem';

// Set NEXT_PUBLIC_FABLE_ITEMS_ADDRESS after deploying FableItems.sol to Celo/Alfajores.
// Leave blank to run in mock mode (NFT recorded in Supabase, no on-chain mint).
export const FABLE_ITEMS_ADDRESS = (
  process.env.NEXT_PUBLIC_FABLE_ITEMS_ADDRESS || ''
) as `0x${string}`;

export const FABLE_ITEMS_ABI = parseAbi([
  'function mint(address to, uint256 tokenId, string itemSlug) external',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function uri(uint256 tokenId) view returns (string)',
  'event ItemMinted(address indexed to, uint256 indexed tokenId, string itemSlug)',
]);

// Item slug → ERC-1155 token ID
export const ITEM_TOKEN_IDS: Record<string, number> = {
  iron_sword:           1,
  ember_blade:          2,
  obsidian_greatsword:  3,
  fire_nova:            4,
  poison_cloak:         5,
  stone_shield:         6,
};

export const TOKEN_ID_TO_SLUG: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM_TOKEN_IDS).map(([slug, id]) => [id, slug])
);

export interface NftItem {
  itemId: string;   // e.g. 'ember_blade'
  tokenId: number;  // ERC-1155 token ID
  txHash: string;   // mint tx hash (or 'mock_...' when contract not deployed)
  mintedAt: string; // ISO timestamp
}

// G$ items that mint an NFT on purchase
export interface GDollarItemDef {
  id: string;
  name: string;
  category: 'weapon' | 'ability';
  icon: string;
  desc: string;
  effect: string;
  attack?: number;
  gdCost: number;
  tokenId: number;
  row: number;
  col: number;
}

export const GD_ITEMS: GDollarItemDef[] = [
  // Weapons (col 0)
  { id: 'iron_sword',          name: 'Iron Sword',    category: 'weapon',  icon: '⚔️',  desc: 'Basic but reliable blade.',          effect: '+12 ATK', attack: 12, gdCost: 2,  tokenId: 1, col: 0, row: 0 },
  { id: 'ember_blade',         name: 'Ember Blade',   category: 'weapon',  icon: '🔥',  desc: 'Forged deep in the lava fields.',     effect: '+15 ATK', attack: 15, gdCost: 5,  tokenId: 2, col: 0, row: 1 },
  { id: 'obsidian_greatsword', name: 'Obsidian GS',   category: 'weapon',  icon: '🗡️',  desc: 'Heaviest volcanic steel known.',      effect: '+60 ATK', attack: 60, gdCost: 25, tokenId: 3, col: 0, row: 2 },
  // Abilities (col 1)
  { id: 'fire_nova',    name: 'Fire Nova',     category: 'ability', icon: '💥', desc: 'AoE fire burst around the hero.',     effect: 'AoE Blast',  gdCost: 8,  tokenId: 4, col: 1, row: 0 },
  { id: 'poison_cloak', name: 'Poison Cloak',  category: 'ability', icon: '☠️', desc: 'Release toxins that slow enemies.',   effect: '10s Slow',   gdCost: 12, tokenId: 5, col: 1, row: 1 },
  { id: 'stone_shield', name: 'Stone Shield',  category: 'ability', icon: '🛡️', desc: 'Volcanic armour surge, +DEF.',        effect: '20s +DEF',   gdCost: 6,  tokenId: 6, col: 1, row: 2 },
];

// Gold (🪙) consumable items — no signing required
export interface GoldItemDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  effect: string;
  goldCost: number;
  heal?: number;
  fullHeal?: boolean;
  tempBuff?: 'damage' | 'defense';
  row: number;
  col: number;
}

export const GOLD_ITEMS: GoldItemDef[] = [
  // Potions (col 0)
  { id: 'minor_potion',  name: 'Minor Potion',  icon: '🧪', desc: 'Restores 30 HP.',          effect: '+30 HP',   goldCost: 15, heal: 30,   col: 0, row: 0 },
  { id: 'greater_potion',name: 'Greater Potion',icon: '⚗️', desc: 'Restores 75 HP.',          effect: '+75 HP',   goldCost: 30, heal: 75,   col: 0, row: 1 },
  { id: 'mega_elixir',   name: 'Mega Elixir',   icon: '✨', desc: 'Fully restores all HP.',    effect: 'Full HP',  goldCost: 60, fullHeal: true, col: 0, row: 2 },
  // Temp Buffs (col 1)
  { id: 'power_surge',   name: 'Power Surge',   icon: '⚡', desc: '+10% damage this zone.',   effect: '+10% DMG', goldCost: 40, tempBuff: 'damage',  col: 1, row: 0 },
  { id: 'iron_ward',     name: 'Iron Ward',      icon: '🪨', desc: '-15% damage taken.',       effect: '-15% DMG', goldCost: 35, tempBuff: 'defense', col: 1, row: 1 },
];
