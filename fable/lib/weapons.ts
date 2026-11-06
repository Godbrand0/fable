import { GD_ITEMS } from './nft';

// Every equippable weapon: the free starter plus the G$ NFT weapons. Lives in lib/
// (not in a React component) so game code and server code can import it without
// pulling in UI modules.
export const STARTER_WEAPON_ID = 'bamboo_stick';

const WEAPON_TEXTURES: Record<string, string> = {
  iron_sword: 'player_iron_sword',
  ember_blade: 'player_ember_blade',
  obsidian_greatsword: 'player_obsidian_gs',
};

export const TAVERN_WEAPONS = [
  { id: STARTER_WEAPON_ID, name: 'Bamboo Stick', attack: 5, textureKey: 'player_bamboo' },
  ...GD_ITEMS.filter(i => i.category === 'weapon').map(i => ({
    id: i.id, name: i.name, attack: i.attack ?? 0, textureKey: WEAPON_TEXTURES[i.id],
  })),
];
