// Public stats for the /stats dashboard. Server-only: called from app/api/stats/route.ts.
//
// Every figure is derived from something a third party can re-check — the Supabase `players`
// table, GoodDollar's Identity contract, and Celo contract events via the Blockscout explorer.
// A source that fails is reported as `null` + an entry in `errors`, never silently as 0: a
// public dashboard that shows a false zero is worse than one that says "unavailable".

import { createClient } from '@supabase/supabase-js';
import { formatUnits } from 'viem';
import { publicClient, G$_ADDRESS, G$_ABI, IDENTITY_ADDRESS, IDENTITY_ABI } from './celo';
import { FABLE_ITEMS_ADDRESS } from './nft';
import { FABLE_MARKETPLACE_ADDRESS } from './marketplace';

const EXPLORER = 'https://celoscan.io';
const BLOCKSCOUT = 'https://celo.blockscout.com';
const FIRST_BLOCK = 70_000_000; // before FableItems was deployed (Jun 2026)
const DAY = 24 * 60 * 60 * 1000;

// keccak256 of the event signatures (see contract/src/*.sol)
const TOPIC = {
  itemPurchased:      '0x1452773cf753d0d7c71ed9990f7c7e2bdde4a2d08d187b3647953877e400488d',
  levelRewardClaimed: '0xfd6d8292dfc5d02692d647e27cc427237cd803f9f18c81e4fc8f1aba3b42cabe',
  sold:               '0x2938a0a3a4a7c19c3a1fe6ef25340b7acd26dfac11de87836084d42fccc18656',
  listed:             '0x98868c46d49b200d82c273c9f28d73265826ca6567690262736450563dfff64c',
} as const;

export interface ProofEntry {
  kind: 'item_purchase' | 'level_reward' | 'marketplace_sale';
  txHash: string;
  url: string;
  at: string;       // ISO time
  amountGd: number;
}

export interface Stats {
  generatedAt: string;
  // 2.2 – 2.4
  users: null | {
    lifetime: number;
    daily: number;
    weekly: number;
    monthly: number;
    onboarded: number;
    newLast30Days: number;
  };
  // 2.5
  verifiedUsers: null | { verified: number; walletsChecked: number };
  // 2.6
  transactions: null | {
    total: number;
    fableItemsContract: number;
    marketplaceContract: number;
    purchasesAndSalesViaG$: number;
    deployments: number;
  };
  // 2.7
  revenue: null | {
    itemSalesGd: number;
    marketplaceFeesGd: number;
    totalGd: number;
    totalUsd: number | null;
  };
  // more
  economy: null | {
    itemPurchases: number;
    levelRewardsPaid: number;
    levelRewardsPaidGd: number;
    rewardPoolGd: number | null;
    marketplaceListings: number;
    marketplaceSales: number;
  };
  prices: { gdUsd: number | null; celoUsd: number | null };
  contracts: { name: string; address: string; url: string }[];
  proof: ProofEntry[];
  errors: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function fetchJson(url: string, timeoutMs = 20_000): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${url.split('?')[0]}`);
  return res.json();
}

interface RawLog { topics: string[]; data: string; transactionHash: string; timeStamp: string }

async function getLogs(address: string, topic0: string): Promise<RawLog[]> {
  const j = await fetchJson(
    `${BLOCKSCOUT}/api?module=logs&action=getLogs&fromBlock=${FIRST_BLOCK}&toBlock=latest&address=${address}&topic0=${topic0}`,
    30_000,
  );
  if (!Array.isArray(j?.result)) throw new Error(`logs unavailable for ${address}`);
  return j.result;
}

const word = (data: string, i: number) => BigInt('0x' + data.slice(2).slice(i * 64, (i + 1) * 64));
const toGd = (v: bigint) => Number(formatUnits(v, 18));
const iso = (hexSeconds: string) => new Date(Number(BigInt(hexSeconds)) * 1000).toISOString();

async function txCount(address: string): Promise<number> {
  const j = await fetchJson(`${BLOCKSCOUT}/api/v2/addresses/${address}/counters`);
  const n = Number(j?.transactions_count);
  if (!Number.isFinite(n)) throw new Error(`counters unavailable for ${address}`);
  return n;
}

// ── main ──────────────────────────────────────────────────────────────────────

export async function getStats(): Promise<Stats> {
  const errors: string[] = [];
  const marketLive = !!FABLE_MARKETPLACE_ADDRESS;
  const out: Stats = {
    generatedAt: new Date().toISOString(),
    users: null, verifiedUsers: null, transactions: null, revenue: null, economy: null,
    prices: { gdUsd: null, celoUsd: null },
    contracts: [
      { name: 'FableItems (items, level rewards)', address: FABLE_ITEMS_ADDRESS, url: `${EXPLORER}/address/${FABLE_ITEMS_ADDRESS}` },
      ...(marketLive ? [{ name: 'FableMarketplace', address: FABLE_MARKETPLACE_ADDRESS, url: `${EXPLORER}/address/${FABLE_MARKETPLACE_ADDRESS}` }] : []),
    ],
    proof: [],
    errors,
  };

  // Each source runs independently so one outage doesn't blank the whole page.
  const [playersR, pricesR, itemsLogsR, rewardLogsR, soldLogsR, listedLogsR, itemsTxR, marketTxR, poolR] = await Promise.allSettled([
    (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error('Supabase not configured');
      const { data, error } = await createClient(url, key)
        .from('players').select('wallet_address, onboarded, created_at, updated_at')
        .neq('wallet_address', 'local_player').limit(100_000);
      if (error) throw new Error(`Supabase: ${error.message}`);
      return data as { wallet_address: string; onboarded: boolean; created_at: string; updated_at: string }[];
    })(),
    fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=gooddollar,celo&vs_currencies=usd', 10_000),
    getLogs(FABLE_ITEMS_ADDRESS, TOPIC.itemPurchased),
    getLogs(FABLE_ITEMS_ADDRESS, TOPIC.levelRewardClaimed),
    marketLive ? getLogs(FABLE_MARKETPLACE_ADDRESS, TOPIC.sold) : Promise.resolve([] as RawLog[]),
    marketLive ? getLogs(FABLE_MARKETPLACE_ADDRESS, TOPIC.listed) : Promise.resolve([] as RawLog[]),
    txCount(FABLE_ITEMS_ADDRESS),
    marketLive ? txCount(FABLE_MARKETPLACE_ADDRESS) : Promise.resolve(0),
    publicClient.readContract({ address: G$_ADDRESS, abi: G$_ABI, functionName: 'balanceOf', args: [FABLE_ITEMS_ADDRESS] }),
  ]);

  const note = (label: string, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') errors.push(`${label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  };
  note('players', playersR); note('prices', pricesR); note('item purchase events', itemsLogsR);
  note('level reward events', rewardLogsR); note('marketplace sale events', soldLogsR);
  note('marketplace listing events', listedLogsR); note('FableItems tx count', itemsTxR);
  note('marketplace tx count', marketTxR); note('reward pool balance', poolR);

  if (pricesR.status === 'fulfilled') {
    out.prices = { gdUsd: pricesR.value?.gooddollar?.usd ?? null, celoUsd: pricesR.value?.celo?.usd ?? null };
  }

  // 2.2 – 2.4 users
  if (playersR.status === 'fulfilled') {
    const rows = playersR.value, now = Date.now();
    const within = (iso: string, ms: number) => now - new Date(iso).getTime() <= ms;
    out.users = {
      lifetime: rows.length,
      daily:   rows.filter(r => within(r.updated_at, DAY)).length,
      weekly:  rows.filter(r => within(r.updated_at, 7 * DAY)).length,
      monthly: rows.filter(r => within(r.updated_at, 30 * DAY)).length,
      onboarded: rows.filter(r => r.onboarded).length,
      newLast30Days: rows.filter(r => within(r.created_at, 30 * DAY)).length,
    };

    // 2.5 verified users: GoodDollar Identity check for every known player wallet, in one multicall
    try {
      const wallets = rows.map(r => r.wallet_address).filter(a => /^0x[0-9a-fA-F]{40}$/.test(a)) as `0x${string}`[];
      const results = await publicClient.multicall({
        contracts: wallets.map(w => ({ address: IDENTITY_ADDRESS, abi: IDENTITY_ABI, functionName: 'getWhitelistedRoot' as const, args: [w] as const })),
        allowFailure: true,
      });
      if (results.some(r => r.status === 'failure')) throw new Error('some identity lookups failed');
      out.verifiedUsers = {
        verified: results.filter(r => r.status === 'success' && r.result !== '0x0000000000000000000000000000000000000000').length,
        walletsChecked: wallets.length,
      };
    } catch (e) {
      errors.push(`verified users: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2.6 transactions and 2.7 revenue — need every event source, otherwise report unavailable
  const logsOk = itemsLogsR.status === 'fulfilled' && rewardLogsR.status === 'fulfilled'
    && soldLogsR.status === 'fulfilled' && listedLogsR.status === 'fulfilled';
  if (logsOk) {
    const purchases = itemsLogsR.value, rewards = rewardLogsR.value, sales = soldLogsR.value, listings = listedLogsR.value;
    const itemSalesGd = purchases.reduce((s, l) => s + toGd(word(l.data, 0)), 0);
    const marketplaceFeesGd = sales.reduce((s, l) => s + toGd(word(l.data, 2)), 0);
    const totalGd = itemSalesGd + marketplaceFeesGd;
    const gdUsd = out.prices.gdUsd;
    out.revenue = { itemSalesGd, marketplaceFeesGd, totalGd, totalUsd: gdUsd != null ? totalGd * gdUsd : null };

    const rewardsGd = rewards.reduce((s, l) => s + toGd(word(l.data, 0)), 0);
    out.economy = {
      itemPurchases: purchases.length,
      levelRewardsPaid: rewards.length,
      levelRewardsPaidGd: rewardsGd,
      rewardPoolGd: poolR.status === 'fulfilled' ? toGd(poolR.value as bigint) : null,
      marketplaceListings: listings.length,
      marketplaceSales: sales.length,
    };

    if (itemsTxR.status === 'fulfilled' && marketTxR.status === 'fulfilled') {
      // Blockscout's counter excludes each contract's creation tx, and buying an item or listing is
      // paid with G$.transferAndCall (a tx to the G$ token), so those are counted from their events.
      const gTxs = new Set([...purchases, ...sales].map(l => l.transactionHash)).size;
      const deployments = 1 + (marketLive ? 1 : 0);
      out.transactions = {
        total: itemsTxR.value + marketTxR.value + gTxs + deployments,
        fableItemsContract: itemsTxR.value,
        marketplaceContract: marketTxR.value,
        purchasesAndSalesViaG$: gTxs,
        deployments,
      };
    }

    const proof: ProofEntry[] = [
      ...purchases.map(l => ({ kind: 'item_purchase' as const, l, amount: toGd(word(l.data, 0)) })),
      ...rewards.map(l => ({ kind: 'level_reward' as const, l, amount: toGd(word(l.data, 0)) })),
      ...sales.map(l => ({ kind: 'marketplace_sale' as const, l, amount: toGd(word(l.data, 1)) })),
    ].map(({ kind, l, amount }) => ({ kind, txHash: l.transactionHash, url: `${EXPLORER}/tx/${l.transactionHash}`, at: iso(l.timeStamp), amountGd: amount }));
    out.proof = proof.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
  }

  return out;
}
