import { NextRequest, NextResponse } from 'next/server';
import { TOKEN_ID_TO_SLUG } from '../../../../lib/nft';

const METADATA: Record<string, object> = {
  iron_sword: {
    name: 'Iron Sword',
    description: 'A basic but reliable blade. Earned in Fable RPG on Celo.',
    image: '/nft/iron_sword.png',
    attributes: [
      { trait_type: 'Type', value: 'Weapon' },
      { trait_type: 'Attack Bonus', value: 12 },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Game', value: 'Fable RPG' },
    ],
  },
  ember_blade: {
    name: 'Ember Blade',
    description: 'Forged deep in the lava fields of Ember Zone. +15 ATK.',
    image: '/nft/ember_blade.png',
    attributes: [
      { trait_type: 'Type', value: 'Weapon' },
      { trait_type: 'Attack Bonus', value: 15 },
      { trait_type: 'Rarity', value: 'Rare' },
      { trait_type: 'Zone', value: 'Ember Fields' },
      { trait_type: 'Game', value: 'Fable RPG' },
    ],
  },
  obsidian_greatsword: {
    name: 'Obsidian Greatsword',
    description: 'The heaviest volcanic steel known to exist. +60 ATK.',
    image: '/nft/obsidian_greatsword.png',
    attributes: [
      { trait_type: 'Type', value: 'Weapon' },
      { trait_type: 'Attack Bonus', value: 60 },
      { trait_type: 'Rarity', value: 'Legendary' },
      { trait_type: 'Zone', value: 'Obsidian Peak' },
      { trait_type: 'Game', value: 'Fable RPG' },
    ],
  },
  fire_nova: {
    name: 'Fire Nova',
    description: 'Unleashes a radial fire burst that engulfs all nearby enemies.',
    image: '/nft/fire_nova.png',
    attributes: [
      { trait_type: 'Type', value: 'Ability' },
      { trait_type: 'Effect', value: 'AoE Blast' },
      { trait_type: 'Rarity', value: 'Rare' },
      { trait_type: 'Game', value: 'Fable RPG' },
    ],
  },
  poison_cloak: {
    name: 'Poison Cloak',
    description: 'Releases toxins that slow and damage nearby enemies for 10 seconds.',
    image: '/nft/poison_cloak.png',
    attributes: [
      { trait_type: 'Type', value: 'Ability' },
      { trait_type: 'Effect', value: '10s Slow' },
      { trait_type: 'Rarity', value: 'Epic' },
      { trait_type: 'Game', value: 'Fable RPG' },
    ],
  },
  stone_shield: {
    name: 'Stone Shield',
    description: 'A volcanic armour surge that greatly reduces damage for 20 seconds.',
    image: '/nft/stone_shield.png',
    attributes: [
      { trait_type: 'Type', value: 'Ability' },
      { trait_type: 'Effect', value: '20s +DEF' },
      { trait_type: 'Rarity', value: 'Rare' },
      { trait_type: 'Game', value: 'Fable RPG' },
    ],
  },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  const id = parseInt(tokenId, 10);
  const slug = TOKEN_ID_TO_SLUG[id];
  const meta = slug ? METADATA[slug] : null;

  if (!meta) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  return NextResponse.json(meta, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
}
