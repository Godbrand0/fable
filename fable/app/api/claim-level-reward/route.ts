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
    const { walletAddress, zone } = await req.json() as { walletAddress: string; zone: string };

    if (!walletAddress || !zone) {
      return NextResponse.json({ error: 'Missing walletAddress or zone' }, { status: 400 });
    }

    const levelId = ZONE_LEVEL_IDS[zone];
    if (!levelId) {
      return NextResponse.json({ error: `Unknown zone: ${zone}` }, { status: 400 });
    }

    const adminKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminKey || !FABLE_ITEMS_ADDRESS) {
      // Dev fallback: return mock reward
      return NextResponse.json({
        success: true,
        mocked: true,
        levelId,
        amount: ZONE_LEVEL_REWARDS[zone] ?? 0,
        txHash: `mock_reward_${zone}_${Date.now()}`,
      });
    }

    // Check on-chain if already claimed (avoid sending a doomed tx)
    const alreadyClaimed = await serverClient.readContract({
      address: FABLE_ITEMS_ADDRESS,
      abi: FABLE_ITEMS_ABI,
      functionName: 'levelClaimed',
      args: [walletAddress as `0x${string}`, BigInt(levelId)],
    });

    if (alreadyClaimed) {
      return NextResponse.json({ success: false, alreadyClaimed: true, levelId });
    }

    const adminAccount = privateKeyToAccount(adminKey as `0x${string}`);
    const adminWallet  = createWalletClient({ account: adminAccount, chain: celo, transport: http(RPC) });

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

    // Fire-and-forget audit log — don't block the response
    dbService.recordLevelRewardClaim(walletAddress, levelId, zone, amount, hash).catch(() => {});

    return NextResponse.json({
      success: true,
      mocked: false,
      levelId,
      amount,
      txHash: hash,
    });
  } catch (err: any) {
    console.error('[claim-level-reward]', err);
    if (err.message?.includes('already claimed')) {
      return NextResponse.json({ success: false, alreadyClaimed: true });
    }
    if (err.message?.includes('not GoodDollar verified')) {
      return NextResponse.json({ success: false, notVerified: true });
    }
    return NextResponse.json({ error: err.message || 'Reward failed' }, { status: 500 });
  }
}
