// What the verification gate covers. Flip a flag to false to let that shop through unverified.
export const VERIFICATION_GATE = {
  tavernGold: true,   // Tavern → Gold Shop (potions, buffs; paid in in-game gold)
  tavernGd:   true,   // Tavern → G$ Shop (NFT weapons/abilities)
  marketplaceBuy: true, // Marketplace → buying someone's listing (listing/cancelling is never gated)
} as const;

export type GatedAction = keyof typeof VERIFICATION_GATE;

export const NOT_VERIFIED_MESSAGE =
  'Verify your identity with GoodDollar in the Bank before buying.';
