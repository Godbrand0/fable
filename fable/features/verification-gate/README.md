# Verification gate

Players must be GoodDollar-verified before buying in the Tavern (gold and G$ shops) or from the Marketplace.

- `config.ts` — which purchases are gated (flip a flag to open one up) and the message shown.
- `useVerificationGate.ts` — `ensureVerified(action)` → `Promise<boolean>`; call it at the top of a buy handler.
- Wired in: `components/TavernShop.tsx`, `components/Marketplace.tsx`; `components/MenuPage.tsx` passes `onNeedsVerification` to send blocked players to the Bank, where verification happens.

This is a UI-level gate. `FableItems.sol` and `FableMarketplace.sol` do not check identity, so enforcing it for direct contract calls would need an on-chain check.
