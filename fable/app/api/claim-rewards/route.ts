import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import { FABLE_ITEMS_ADDRESS, FABLE_ITEMS_ABI, ZONE_LEVEL_IDS, ZONE_LEVEL_REWARDS } from '../../../lib/nft';
import { dbService } from '../../../lib/supabaseClient';

const RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';

const serverClient = createPublicClient({ chain: celo, transport: http(RPC) });

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, zones } = await req.json() as { walletAddress: string; zones: string[] };

    if (!walletAddress || !zones || !Array.isArray(zones) || zones.length === 0) {
      return NextResponse.json({ error: 'Missing walletAddress or zones' }, { status: 400 });
    }

    const adminKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminKey || !FABLE_ITEMS_ADDRESS) {
      // Dev fallback: return mock reward
      return NextResponse.json({
        success: true,
        mocked: true,
        zones,
        txHash: `mock_reward_batch_${Date.now()}`,
      });
    }

    const adminAccount = privateKeyToAccount(adminKey as `0x${string}`);
    const adminWallet  = createWalletClient({ account: adminAccount, chain: celo, transport: http(RPC) });

    let claimedCount = 0;

    for (const zone of zones) {
      const levelId = ZONE_LEVEL_IDS[zone];
      if (!levelId) continue;

      const alreadyClaimed = await serverClient.readContract({
        address: FABLE_ITEMS_ADDRESS,
        abi: FABLE_ITEMS_ABI,
        functionName: 'levelClaimed',
        args: [walletAddress as `0x${string}`, BigInt(levelId)],
      });

      if (alreadyClaimed) continue;

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
        dbService.recordLevelRewardClaim(walletAddress, levelId, zone, amount, hash).catch(() => {});
        claimedCount++;
      } catch (err: any) {
        if (err.message?.includes('not GoodDollar verified')) {
          return NextResponse.json({ success: false, notVerified: true });
        }
        console.error(`[claim-rewards] error claiming zone ${zone}:`, err);
        // Continue to the next one
      }
    }

    if (claimedCount === 0) {
      return NextResponse.json({ success: false, alreadyClaimedAll: true });
    }

    return NextResponse.json({
      success: true,
      mocked: false,
      zones
    });
  } catch (err: any) {
    console.error('[claim-rewards]', err);
    return NextResponse.json({ error: err.message || 'Reward failed' }, { status: 500 });
  }
}
