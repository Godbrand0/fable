import { parseAbi } from 'viem';

// Set after deploying contract/src/FableMarketplace.sol. While unset, a connected
// real wallet sees "not deployed" and the dev mock wallet uses a localStorage market.
export const FABLE_MARKETPLACE_ADDRESS = (
  process.env.NEXT_PUBLIC_FABLE_MARKETPLACE_ADDRESS || ''
) as `0x${string}` | '';

export const FABLE_MARKETPLACE_ABI = parseAbi([
  // ── Read ──────────────────────────────────────────────────────────────────
  'function nextListingId() view returns (uint256)',
  'function feeBps() view returns (uint256)',
  'function getActiveListings(uint256 startId, uint256 count) view returns (uint256[] ids, (address seller, uint256 tokenId, uint256 price, bool active)[] result)',
  // ── Write ─────────────────────────────────────────────────────────────────
  'function list(uint256 tokenId, uint256 price) returns (uint256 listingId)',
  'function cancel(uint256 listingId)',
  // Buying is gToken.transferAndCall(marketplace, price, abi.encode(listingId))
  // ── Events ────────────────────────────────────────────────────────────────
  'event Listed(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 price)',
  'event Cancelled(uint256 indexed listingId, address indexed seller)',
  'event Sold(uint256 indexed listingId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 price, uint256 fee)',
]);

export interface MarketListing {
  id: number;
  seller: string;   // lowercase address
  tokenId: number;
  price: number;    // human-readable G$
}
