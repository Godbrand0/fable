// GoodDollar Engagement Rewards: a one-time G$ bonus, paid by GoodDollar's contract, for each
// GoodDollar-verified player who joins Fable, with an optional share for whoever invited them.
//
// Contract: https://github.com/GoodDollar/GoodSDKs/tree/main/packages/engagement-contracts
// A claim needs two EIP-712 signatures:
//   - the player's (Claim: app, inviter, validUntilBlock, app description), signed in their wallet
//   - Fable's (AppClaim: app, user, validUntilBlock), signed on the server by the app, its owner
//     or its registered signer (see app/api/engagement/sign/route.ts)
// and the player then sends nonContractAppClaim(app, inviter, validUntilBlock, userSig, appSig).
//
// Rules enforced on-chain: player must be GoodDollar-verified, one claim per player per app every
// 180 days, a player can claim from at most `maxAppsPerUser` apps per 180 days, validUntilBlock must
// be within 600 blocks of now, and the app must be registered + approved by GoodDollar.

import { parseAbi, formatUnits, isAddress, zeroAddress, type Address } from 'viem';
import { publicClient, celoService } from './celo';

export const ENGAGEMENT_REWARDS_ADDRESS = (process.env.NEXT_PUBLIC_ENGAGEMENT_REWARDS_ADDRESS
  || '0x25db74CF4E7BA120526fd87e159CF656d94bAE43') as Address; // production proxy on Celo

/** The address Fable registered with `applyApp`. Unset = feature hidden. */
export const ENGAGEMENT_APP_ADDRESS = (process.env.NEXT_PUBLIC_ENGAGEMENT_APP_ADDRESS || '') as Address | '';

export const engagementEnabled = () => isAddress(ENGAGEMENT_APP_ADDRESS);

export const ENGAGEMENT_ABI = parseAbi([
  'function registeredApps(address) view returns (address owner, address rewardReceiver, uint96 totalRewardsClaimed, uint32 registeredAt, uint32 lastResetAt, uint8 userAndInviterPercentage, uint8 userPercentage, bool isRegistered, bool isApproved, string description, string url, string email, address app, address signer)',
  'function appsStats(address) view returns (uint96 numberOfRewards, uint96 totalAppRewards, uint96 totalUserRewards, uint96 totalInviterRewards)',
  'function userRegistrations(address app, address user) view returns (uint32 isRegistered, uint32 lastClaimTimestamp)',
  'function rewardAmount() view returns (uint96)',
  'function canClaim(address app, address user) view returns (bool)',
  'function nonContractAppClaim(address app, address inviter, uint256 validUntilBlock, bytes userSignature, bytes appSignature) returns (bool)',
]);

export const EIP712_DOMAIN = {
  name: 'EngagementRewards',
  version: '1.0',
  chainId: 42220,
  verifyingContract: ENGAGEMENT_REWARDS_ADDRESS,
} as const;

export const CLAIM_TYPES = {
  Claim: [
    { name: 'app', type: 'address' },
    { name: 'inviter', type: 'address' },
    { name: 'validUntilBlock', type: 'uint256' },
    { name: 'description', type: 'string' },
  ],
} as const;

export const APP_CLAIM_TYPES = {
  AppClaim: [
    { name: 'app', type: 'address' },
    { name: 'user', type: 'address' },
    { name: 'validUntilBlock', type: 'uint256' },
  ],
} as const;

/** Signatures are valid for this many blocks (contract max is 600; Celo blocks are ~1s). */
export const SIGNATURE_WINDOW_BLOCKS = BigInt(300);

export interface AppProgram {
  registered: boolean;
  approved: boolean;
  description: string;
  rewardGd: number;       // total paid per claim
  playerGd: number;       // player's share
  inviterGd: number;      // inviter's share (goes to Fable when there's no inviter)
}

export async function getAppProgram(): Promise<AppProgram | null> {
  if (!engagementEnabled()) return null;
  const app = ENGAGEMENT_APP_ADDRESS as Address;
  const [info, amount] = await Promise.all([
    publicClient.readContract({ address: ENGAGEMENT_REWARDS_ADDRESS, abi: ENGAGEMENT_ABI, functionName: 'registeredApps', args: [app] }),
    publicClient.readContract({ address: ENGAGEMENT_REWARDS_ADDRESS, abi: ENGAGEMENT_ABI, functionName: 'rewardAmount' }),
  ]);
  const [, , , , , userAndInviterPct, userPct, isRegistered, isApproved, description] = info;
  const shared = (amount * BigInt(userAndInviterPct)) / BigInt(100);
  const player = (shared * BigInt(userPct)) / BigInt(100);
  return {
    registered: isRegistered,
    approved: isApproved,
    description,
    rewardGd: Number(formatUnits(amount, 18)),
    playerGd: Number(formatUnits(player, 18)),
    inviterGd: Number(formatUnits(shared - player, 18)),
  };
}

/** True when the contract would pay this player right now (verified, not claimed in 180 days, etc). */
export async function canClaimBonus(user: Address): Promise<boolean> {
  if (!engagementEnabled()) return false;
  try {
    // canClaim reverts with a reason instead of returning false
    return await publicClient.readContract({
      address: ENGAGEMENT_REWARDS_ADDRESS, abi: ENGAGEMENT_ABI, functionName: 'canClaim',
      args: [ENGAGEMENT_APP_ADDRESS as Address, user],
    });
  } catch {
    return false;
  }
}

export async function getAppStats() {
  if (!engagementEnabled()) return null;
  const [n, app, user, inviter] = await publicClient.readContract({
    address: ENGAGEMENT_REWARDS_ADDRESS, abi: ENGAGEMENT_ABI, functionName: 'appsStats',
    args: [ENGAGEMENT_APP_ADDRESS as Address],
  });
  return {
    claims: Number(n),
    appGd: Number(formatUnits(app, 18)),
    playersGd: Number(formatUnits(user, 18)),
    invitersGd: Number(formatUnits(inviter, 18)),
  };
}

// ── claiming (client) ─────────────────────────────────────────────────────────

export type ClaimResult =
  | { ok: true; txHash: string; inviter: Address }
  | { ok: false; error: string };

/**
 * Claim the welcome bonus for the connected wallet. The player signs one message and sends one
 * transaction (gas is topped up by /api/fund-new-wallet, which only ever funds a wallet once).
 */
export async function claimWelcomeBonus(player: string): Promise<ClaimResult> {
  const user = player as Address;
  const walletClient = celoService.getWalletClient(user);
  if (!walletClient) return { ok: false, error: 'Connect your wallet first.' };

  try {
    await celoService.ensureCeloNetwork();

    // Gas for new Google-login wallets; a no-op for anyone already funded
    await fetch('/api/fund-new-wallet', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: user }),
    }).catch(() => {});

    const res = await fetch('/api/engagement/sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: user }),
    });
    const signed = await res.json();
    if (!res.ok) return { ok: false, error: friendlyError(signed?.error) };

    const app = ENGAGEMENT_APP_ADDRESS as Address;
    const validUntilBlock = BigInt(signed.validUntilBlock);
    const inviter = getReferrer(user);
    const program = await getAppProgram();
    if (!program) return { ok: false, error: 'Bonus not available right now.' };

    const userSignature = await walletClient.signTypedData({
      account: user,
      domain: EIP712_DOMAIN,
      types: CLAIM_TYPES,
      primaryType: 'Claim',
      message: { app, inviter, validUntilBlock, description: program.description },
    });

    const { request } = await publicClient.simulateContract({
      account: user,
      address: ENGAGEMENT_REWARDS_ADDRESS,
      abi: ENGAGEMENT_ABI,
      functionName: 'nonContractAppClaim',
      args: [app, inviter, validUntilBlock, userSignature, signed.appSignature],
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') return { ok: false, error: 'The claim transaction failed.' };
    return { ok: true, txHash: hash, inviter };
  } catch (e: any) {
    console.error('[engagement] claim failed', e);
    return { ok: false, error: friendlyError(e?.shortMessage || e?.message) };
  }
}

function friendlyError(msg?: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('user rejected') || m.includes('denied')) return 'Signature cancelled.';
  if (m.includes('not whitelisted')) return 'Verify with GoodDollar first.';
  if (m.includes('cooldown') || m.includes('already')) return 'You already claimed this bonus.';
  if (m.includes('max apps')) return 'You have claimed the most bonuses allowed this period (3 apps per 180 days).';
  if (m.includes('maxed rewards') || m.includes('insufficient reward')) return 'The bonus pool is empty for now. Try again later.';
  if (m.includes('play a game')) return 'Play a game first to unlock the bonus.';
  if (m.includes('expired')) return 'Took too long. Please try again.';
  if (m.includes('insufficient funds')) return 'Not enough CELO for gas. Try again in a minute.';
  return msg || 'Claim failed.';
}

// ── invite links ──────────────────────────────────────────────────────────────

const REF_KEY = 'fable_ref';

/** Save `?ref=0x…` from the URL (first one wins) and strip it from the address bar. */
export function captureReferral(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get('ref');
    if (!ref) return;
    if (isAddress(ref) && !localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, ref.toLowerCase());
    url.searchParams.delete('ref');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* storage blocked: invites just don't credit */ }
}

/** The inviter to credit for this player, or the zero address. Never the player themself. */
export function getReferrer(player: string): Address {
  try {
    const ref = localStorage.getItem(REF_KEY);
    if (ref && isAddress(ref) && ref.toLowerCase() !== player.toLowerCase()) return ref as Address;
  } catch { /* ignore */ }
  return zeroAddress;
}

export function inviteLink(player: string): string {
  return `${window.location.origin}/?ref=${player}`;
}
