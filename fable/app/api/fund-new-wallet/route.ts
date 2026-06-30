import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';

const CELO_RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';
const FUNDING_AMOUNT = parseEther('0.005'); // 0.005 CELO — enough for ~10+ claims
const ALREADY_FUNDED_KEY = 'funded'; // We'll track this in Supabase

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, userId } = await req.json();

    if (!walletAddress || !userId) {
      return NextResponse.json({ error: 'Missing walletAddress or userId' }, { status: 400 });
    }

    // Check if already funded in DB
    const { data: profile } = await supabase
      .from('players')
      .select('celo_funded')
      .eq('user_id', userId)
      .single();

    if (profile?.celo_funded) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Already funded' });
    }

    const adminKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminKey || adminKey === '<your_deployer_private_key>') {
      console.warn('ADMIN_PRIVATE_KEY not configured. Skipping CELO funding.');
      return NextResponse.json({ success: true, skipped: true, reason: 'Funder not configured' });
    }

    const account = privateKeyToAccount(adminKey as `0x${string}`);
    const publicClient = createPublicClient({ chain: celo, transport: http(CELO_RPC) });
    const walletClient = createWalletClient({ account, chain: celo, transport: http(CELO_RPC) });

    // Check admin balance
    const balance = await publicClient.getBalance({ address: account.address });
    if (balance < FUNDING_AMOUNT) {
      console.error('Admin wallet has insufficient CELO for funding.');
      return NextResponse.json({ success: false, error: 'Funder balance too low' }, { status: 500 });
    }

    // Send CELO
    const hash = await walletClient.sendTransaction({
      to: walletAddress as `0x${string}`,
      value: FUNDING_AMOUNT,
    });

    await publicClient.waitForTransactionReceipt({ hash });

    // Mark as funded in DB
    await supabase
      .from('players')
      .upsert({ user_id: userId, celo_funded: true }, { onConflict: 'user_id' });

    console.log(`Funded ${walletAddress} with 0.005 CELO. Tx: ${hash}`);
    return NextResponse.json({ success: true, txHash: hash });

  } catch (err: any) {
    console.error('Fund wallet error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
