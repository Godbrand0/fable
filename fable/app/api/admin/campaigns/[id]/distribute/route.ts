import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '../../../../../../lib/adminAuth';
import { supabaseAdmin } from '../../../../../../lib/adminSupabase';
import { getCampaignWinnersForMode, sendG$ } from '../../../../../../lib/campaigns';

// Re-derives winners from on-chain data (never trusts anything the client sent) and
// sends G$ directly from the admin wallet. Protection against paying anyone twice:
//
//   1. Campaign lock: the campaign is moved to 'distributing' with a conditional
//      update. Only one request can make that transition, so a double-click or two
//      admins clicking at once can't run two payout loops.
//   2. Per-winner reservation: a campaign_payouts row (unique on campaign + wallet)
//      is inserted BEFORE sending. If the insert conflicts, that wallet is skipped.
//      The tx hash is written the moment the transfer is broadcast.
//
// A reserved row with no tx hash means a previous pass stopped between reserving
// and broadcasting (or broadcast without recording the hash). Those are never
// re-sent automatically; they're reported as needing a manual check on-chain.
//
// Ends as 'paid' once every winner has a confirmed payout, otherwise 'failed' so the
// dashboard shows "retry", and the next pass only handles what's left.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }
  const db = supabaseAdmin;

  const { id } = await params;
  const { data: campaign, error } = await db.from('campaigns').select('*').eq('id', id).single();
  if (error || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  if (campaign.status === 'paid') {
    return NextResponse.json({ error: 'Campaign already fully paid' }, { status: 409 });
  }

  const startsAtMs = new Date(campaign.starts_at).getTime();
  const endsAtMs = new Date(campaign.ends_at).getTime();
  if (Date.now() <= endsAtMs) {
    return NextResponse.json({ error: 'Campaign window has not closed yet' }, { status: 400 });
  }

  // 1. Take the lock.
  const { data: locked } = await db
    .from('campaigns')
    .update({ status: 'distributing' })
    .eq('id', id)
    .in('status', ['pending', 'failed'])
    .select('id');
  if (!locked || locked.length === 0) {
    return NextResponse.json({ error: 'A payout for this campaign is already in progress' }, { status: 409 });
  }

  let finalStatus: 'paid' | 'failed' = 'failed';
  try {
    let winners;
    try {
      winners = await getCampaignWinnersForMode(campaign.mode, startsAtMs, endsAtMs, campaign.top_n);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Failed to compute winners' }, { status: 500 });
    }

    if (winners.length === 0) {
      return NextResponse.json({ error: 'No qualifying scores in this campaign window' }, { status: 400 });
    }

    const amountEach = Number(campaign.pool_gd) / winners.length;
    const results: { wallet: string; rank: number; amountGd: number; txHash?: string; error?: string }[] = [];

    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      const rank = i + 1;

      // 2. Reserve this winner's payout before any G$ moves.
      const { error: reserveError } = await db.from('campaign_payouts').insert({
        campaign_id: id,
        wallet_address: winner.wallet,
        rank,
        score: winner.score.toString(),
        amount_gd: amountEach,
        tx_hash: null,
      });

      if (reserveError) {
        if (reserveError.code !== '23505') {
          results.push({ wallet: winner.wallet, rank, amountGd: amountEach, error: 'Could not reserve payout row' });
          continue;
        }
        // Already reserved by an earlier pass: paid if it has a hash, otherwise needs a human.
        const { data: existing } = await db
          .from('campaign_payouts')
          .select('tx_hash')
          .eq('campaign_id', id)
          .eq('wallet_address', winner.wallet)
          .single();
        if (existing?.tx_hash) {
          results.push({ wallet: winner.wallet, rank, amountGd: amountEach, txHash: existing.tx_hash });
        } else {
          results.push({
            wallet: winner.wallet, rank, amountGd: amountEach,
            error: 'Earlier attempt stopped before recording a tx hash. Check the admin wallet on-chain, then set tx_hash on this payout row or delete the row to retry.',
          });
        }
        continue;
      }

      // Assigned inside the sendG$ callback; the cast stops TS narrowing it to `null`.
      let broadcastHash = null as string | null;
      try {
        const txHash = await sendG$(winner.wallet, amountEach, async hash => {
          broadcastHash = hash;
          await db.from('campaign_payouts').update({ tx_hash: hash }).eq('campaign_id', id).eq('wallet_address', winner.wallet);
        });
        results.push({ wallet: winner.wallet, rank, amountGd: amountEach, txHash });
      } catch (err: any) {
        if (!broadcastHash) {
          // Nothing was broadcast: release the reservation so the next pass retries it.
          await db.from('campaign_payouts').delete().eq('campaign_id', id).eq('wallet_address', winner.wallet).is('tx_hash', null);
          results.push({ wallet: winner.wallet, rank, amountGd: amountEach, error: err.message || 'Send failed' });
        } else {
          // Broadcast but not confirmed: keep the row so it's never sent twice.
          results.push({ wallet: winner.wallet, rank, amountGd: amountEach, error: `Sent (${broadcastHash}) but not confirmed. Check it on-chain.` });
        }
      }
    }

    const allPaid = results.every(r => r.txHash && !r.error);
    finalStatus = allPaid ? 'paid' : 'failed';
    return NextResponse.json({ status: finalStatus, results });
  } finally {
    // Release the lock whatever happened above.
    await db
      .from('campaigns')
      .update({ status: finalStatus, paid_at: finalStatus === 'paid' ? new Date().toISOString() : null })
      .eq('id', id);
  }
}
