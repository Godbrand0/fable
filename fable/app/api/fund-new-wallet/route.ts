import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getSessionWallet } from '../../../lib/session';
import { supabaseAdmin } from '../../../lib/adminSupabase';

const CELO_RPC = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org';
const FUNDING_AMOUNT = parseEther('0.005'); // 0.005 CELO — enough for ~10+ claims
// Total wallets funded per rolling 24h. Signing in proves wallet ownership but anyone
// can make new wallets, so this cap is what bounds the admin wallet's worst-case loss.
const DAILY_CAP = Number(process.env.FUNDING_DAILY_CAP || 50);

// Sends a little CELO for gas to a brand-new embedded wallet, once per wallet.
//   - the recipient is the signed-in session wallet, never the request body;
//   - only wallets with no balance and no transactions qualify;
//   - inserting into celo_fundings (wallet_address is the primary key) claims the
//     wallet atomically before any CELO moves, so parallel requests can't double-fund.
export async function POST(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const adminKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminKey || adminKey === '<your_deployer_private_key>') {
    return NextResponse.json({ success: true, skipped: true, reason: 'Funder not configured' });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Funder not configured' });
  }

  const address = wallet as `0x${string}`;
  const publicClient = createPublicClient({ chain: celo, transport: http(CELO_RPC) });

  try {
    const [balance, txCount] = await Promise.all([
      publicClient.getBalance({ address }),
      publicClient.getTransactionCount({ address }),
    ]);
    if (balance > BigInt(0) || txCount > 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Wallet is not new' });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('celo_fundings')
      .select('wallet_address', { count: 'exact', head: true })
      .gte('funded_at', since);
    if ((count ?? 0) >= DAILY_CAP) {
      console.warn('[fund-new-wallet] daily cap reached');
      return NextResponse.json({ success: true, skipped: true, reason: 'Daily funding limit reached' });
    }

    const { error: claimError } = await supabaseAdmin.from('celo_fundings').insert({ wallet_address: wallet });
    if (claimError) {
      if (claimError.code === '23505') {
        return NextResponse.json({ success: true, skipped: true, reason: 'Already funded' });
      }
      throw claimError;
    }

    let hash: `0x${string}`;
    try {
      const account = privateKeyToAccount(adminKey as `0x${string}`);
      const walletClient = createWalletClient({ account, chain: celo, transport: http(CELO_RPC) });
      const funderBalance = await publicClient.getBalance({ address: account.address });
      if (funderBalance < FUNDING_AMOUNT) throw new Error('Funder balance too low');

      hash = await walletClient.sendTransaction({ to: address, value: FUNDING_AMOUNT });
    } catch (sendErr) {
      // Nothing was sent: release the claim so the wallet can be funded on a later attempt.
      await supabaseAdmin.from('celo_fundings').delete().eq('wallet_address', wallet);
      throw sendErr;
    }

    // From here the CELO is on its way, so the claim row stays even if the steps below fail.
    await supabaseAdmin.from('celo_fundings').update({ tx_hash: hash }).eq('wallet_address', wallet);
    await supabaseAdmin.from('players').update({ celo_funded: true }).eq('wallet_address', wallet);
    await publicClient.waitForTransactionReceipt({ hash });

    console.log(`Funded ${wallet} with 0.005 CELO. Tx: ${hash}`);
    return NextResponse.json({ success: true, txHash: hash });
  } catch (err: any) {
    console.error('Fund wallet error:', err);
    return NextResponse.json({ error: 'Funding failed' }, { status: 500 });
  }
}
