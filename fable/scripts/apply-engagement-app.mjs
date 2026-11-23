// One-time: register Fable with GoodDollar's EngagementRewards contract on Celo.
// After this, GoodDollar has to approve the app before players can claim.
//
// Usage (from fable/):
//   OWNER_PRIVATE_KEY=0x… APP_URL=https://… APP_EMAIL=you@… node scripts/apply-engagement-app.mjs           # dry run
//   OWNER_PRIVATE_KEY=0x… APP_URL=https://… APP_EMAIL=you@… node scripts/apply-engagement-app.mjs --send    # submit
//
// Optional env:
//   APP_ADDRESS            address players claim against (default: the owner's address)
//   REWARD_RECEIVER        where Fable's share goes (default: the owner's address)
//   USER_AND_INVITER_PCT   % of each 5,000 G$ reward that goes to player + inviter (default 80)
//   USER_PCT               % of that share that goes to the player; the rest to the inviter (default 60)
//   SIGNER_ADDRESS         separate key that signs claims on the server (default: none, the owner signs)
//
// Re-running with --send re-registers: it resets GoodDollar's approval, so only do that on purpose.

import { createPublicClient, createWalletClient, http, parseAbi, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';

const CONTRACT = '0x25db74CF4E7BA120526fd87e159CF656d94bAE43';
const ABI = parseAbi([
  'function applyApp(address app, address rewardReceiver, uint8 userAndInviterPercentage, uint8 userPercentage, string description, string url, string email)',
  'function setAppSigner(address app, address signer)',
  'function registeredApps(address) view returns (address owner, address rewardReceiver, uint96 totalRewardsClaimed, uint32 registeredAt, uint32 lastResetAt, uint8 userAndInviterPercentage, uint8 userPercentage, bool isRegistered, bool isApproved, string description, string url, string email, address app, address signer)',
]);

// 50–512 characters. Players sign this text when they claim, so keep it stable once approved.
const DESCRIPTION =
  'Fable is a volcanic action RPG on Celo. Verified players claim G$ UBI daily inside the game, ' +
  'earn G$ for clearing zones, and spend it on NFT weapons and skins in the Tavern and marketplace.';

const env = (k, d) => process.env[k] ?? d;
const fail = (m) => { console.error(`✖ ${m}`); process.exit(1); };

const key = env('OWNER_PRIVATE_KEY');
if (!key?.startsWith('0x')) fail('Set OWNER_PRIVATE_KEY (0x…)');
const owner = privateKeyToAccount(key);
const app = env('APP_ADDRESS', owner.address);
const receiver = env('REWARD_RECEIVER', owner.address);
const url = env('APP_URL') || fail('Set APP_URL (the live game URL)');
const email = env('APP_EMAIL') || fail('Set APP_EMAIL (GoodDollar contacts you here)');
const uiPct = Number(env('USER_AND_INVITER_PCT', '80'));
const uPct = Number(env('USER_PCT', '60'));
const signer = env('SIGNER_ADDRESS');

if (!isAddress(app) || !isAddress(receiver)) fail('APP_ADDRESS / REWARD_RECEIVER must be addresses');
if (signer && !isAddress(signer)) fail('SIGNER_ADDRESS must be an address');
for (const [n, v] of [['USER_AND_INVITER_PCT', uiPct], ['USER_PCT', uPct]]) {
  if (!Number.isInteger(v) || v < 0 || v > 100) fail(`${n} must be 0–100`);
}
if (DESCRIPTION.length < 50 || DESCRIPTION.length > 512) fail('Description must be 50–512 chars');

const pc = createPublicClient({ chain: celo, transport: http('https://forno.celo.org') });
const wc = createWalletClient({ account: owner, chain: celo, transport: http('https://forno.celo.org') });

const reward = 5000;
const shared = (reward * uiPct) / 100;
console.log(`Owner:      ${owner.address}
App:        ${app}
Receiver:   ${receiver}
Split:      player ${(shared * uPct) / 100} G$ · inviter ${shared - (shared * uPct) / 100} G$ · Fable ${reward - shared} G$ (+ inviter share when there's no inviter)
URL:        ${url}
Email:      ${email}
Signer:     ${signer || '(owner key signs)'}
Description (${DESCRIPTION.length} chars): ${DESCRIPTION}
`);

const current = await pc.readContract({ address: CONTRACT, abi: ABI, functionName: 'registeredApps', args: [app] });
if (current[7]) console.log(`Already registered · approved: ${current[8]} · owner ${current[0]}\n`);

if (!process.argv.includes('--send')) {
  console.log('Dry run. Re-run with --send to submit.');
  process.exit(0);
}

const hash = await wc.writeContract({
  address: CONTRACT, abi: ABI, functionName: 'applyApp',
  args: [app, receiver, uiPct, uPct, DESCRIPTION, url, email],
});
console.log(`applyApp tx: https://celoscan.io/tx/${hash}`);
await pc.waitForTransactionReceipt({ hash });

if (signer) {
  const h2 = await wc.writeContract({ address: CONTRACT, abi: ABI, functionName: 'setAppSigner', args: [app, signer] });
  console.log(`setAppSigner tx: https://celoscan.io/tx/${h2}`);
  await pc.waitForTransactionReceipt({ hash: h2 });
}

console.log(`\n✓ Applied. Now ask GoodDollar to approve app ${app}, then set NEXT_PUBLIC_ENGAGEMENT_APP_ADDRESS=${app} on Vercel.`);
