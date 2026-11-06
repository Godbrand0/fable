import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import { FABLE_ITEMS_ADDRESS, FABLE_ITEMS_ABI, ZONE_LEVEL_IDS, ZONE_LEVEL_REWARDS } from '../../../lib/nft';
import { recordLevelRewardClaim } from '../../../lib/serverDb';
import { getSessionWallet } from '../../../lib/session';

const RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';

const serverClient = createPublicClient({ chain: celo, transport: http(RPC) });

// Pays out zone-clear rewards to the signed-in wallet. The recipient always comes from
// the session cookie — never the request body — so nobody can trigger payouts for, or
// redirect them to, a wallet they don't control. The contract still enforces
// one claim per wallet per level and GoodDollar identity.
export async function POST(req: NextRequest) {
  try {
    const walletAddress = getSessionWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const { zones: rawZones } = await req.json() as { zones: string[] };
    if (!Array.isArray(rawZones) || rawZones.length === 0) {
      return NextResponse.json({ error: 'Missing zones' }, { status: 400 });
    }
    const zones = Array.from(new Set(rawZones.filter((z): z is string => typeof z === 'string'))).slice(0, 10);

    const adminKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminKey || !FABLE_ITEMS_ADDRESS) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Rewards are not configured' }, { status: 500 });
      }
      // Dev fallback: return mock reward
      return NextResponse.json({
        success: true,
        mocked: true,
        zones,
        settledZones: zones,
        txHash: `mock_reward_batch_${Date.now()}`,
      });
    }

    const adminAccount = privateKeyToAccount(adminKey as `0x${string}`);
    const adminWallet  = createWalletClient({ account: adminAccount, chain: celo, transport: http(RPC) });

    let claimedCount = 0;
    // Zones whose reward is no longer owed: paid just now, already paid on-chain, or not a rewardable zone.
    const settledZones: string[] = [];

    for (const zone of zones) {
      const levelId = ZONE_LEVEL_IDS[zone];
      if (!levelId) { settledZones.push(zone); continue; }

      const alreadyClaimed = await serverClient.readContract({
        address: FABLE_ITEMS_ADDRESS,
        abi: FABLE_ITEMS_ABI,
        functionName: 'levelClaimed',
        args: [walletAddress as `0x${string}`, BigInt(levelId)],
      });

      if (alreadyClaimed) { settledZones.push(zone); continue; }

      try {
        const { request } = await serverClient.simulateContract({
          account: adminAccount,
          address: FABLE_ITEMS_ADDRESS,
          abi: FABLE_ITEMS_ABI,
          functionName: 'grantLevelReward',
          args: [walletAddress as `0x${string}`, BigInt(levelId)],
        });

        const hash = await adminWallet.writeContract(request);
        await serverClient.waitForTransactionReceipt({ hash });

        const amount = ZONE_LEVEL_REWARDS[zone] ?? 0;
        recordLevelRewardClaim(walletAddress, levelId, zone, amount, hash).catch(() => {});
        claimedCount++;
        settledZones.push(zone);
      } catch (err: any) {
        if (err.message?.includes('not GoodDollar verified')) {
          return NextResponse.json({ success: false, notVerified: true });
        }
        console.error(`[claim-rewards] error claiming zone ${zone}:`, err);
        // Continue to the next one
      }
    }

    if (claimedCount === 0) {
      // Nothing paid just now: either everything was already claimed, or every attempt errored.
      const alreadyClaimedAll = settledZones.length === zones.length;
      return NextResponse.json({ success: false, alreadyClaimedAll, settledZones });
    }

    return NextResponse.json({
      success: true,
      mocked: false,
      zones,
      settledZones,
    });
  } catch (err: any) {
    console.error('[claim-rewards]', err);
    return NextResponse.json({ error: 'Reward failed' }, { status: 500 });
  }
}
