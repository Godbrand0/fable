'use client';

import { useEffect, useState } from 'react';
import type { Stats } from '../../lib/stats';

const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

const KIND_LABEL = {
  item_purchase: 'Item purchase',
  level_reward: 'Level reward paid',
  marketplace_sale: 'Marketplace sale',
} as const;

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{title}</div>
      <div className={`mt-1 text-3xl font-bold ${value === 'Unavailable' ? 'text-zinc-600' : 'text-emerald-400'}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] leading-snug text-zinc-500">{sub}</div>}
    </div>
  );
}

export default function StatsPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setS).catch(() => setFailed(true));
  }, []);

  if (failed) return <Shell><p className="text-sm text-red-400">Could not load stats. Please retry in a minute.</p></Shell>;
  if (!s) return <Shell><p className="text-sm text-zinc-500">Loading live numbers…</p></Shell>;

  const u = s.users, t = s.transactions, r = s.revenue, e = s.economy;
  const na = 'Unavailable';

  return (
    <Shell updated={s.generatedAt}>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Lifetime users" value={u ? fmt(u.lifetime) : na}
          sub={u ? `${u.onboarded} finished the tutorial · ${u.newLast30Days} joined in the last 30 days. Includes internal test accounts.` : undefined} />
        <Card title="Active users (weekly)" value={u ? fmt(u.weekly) : na}
          sub={u ? `${u.daily} in the last 24h · ${u.weekly} in 7 days · ${u.monthly} in 30 days. Active = saved game progress in the window.` : undefined} />
        <Card title="Active users frequency" value="Weekly" sub="The headline active-users figure is the 7-day count." />
        <Card title="GoodDollar-verified users today" value={s.verifiedUsers ? fmt(s.verifiedUsers.verified) : na}
          sub={s.verifiedUsers ? `Of ${s.verifiedUsers.walletsChecked} player wallets, checked live against GoodDollar's Identity contract.` : undefined} />
        <Card title="On-chain transactions to date" value={t ? fmt(t.total) : na}
          sub={t ? `${t.fableItemsContract} to the items contract · ${t.marketplaceContract} to the marketplace · ${t.purchasesAndSalesViaG$} G$ purchases/sales · ${t.deployments} contract deployments. Includes admin setup transactions.` : undefined} />
        <Card title="Revenue earned to date" value={r ? `${fmt(r.totalGd)} G$` : na}
          sub={r ? `${r.totalUsd != null ? `≈ ${usd(r.totalUsd)} at today's price · ` : ''}${fmt(r.itemSalesGd)} G$ item sales + ${fmt(r.marketplaceFeesGd)} G$ marketplace fees (10%).` : undefined} />
      </section>

      {e && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">More</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card title="G$ level rewards paid" value={`${fmt(e.levelRewardsPaidGd)} G$`} sub={`${e.levelRewardsPaid} payouts, verified players only`} />
            <Card title="Reward pool balance" value={e.rewardPoolGd != null ? `${fmt(e.rewardPoolGd)} G$` : na} sub={e.rewardPoolGd != null && s.prices.gdUsd ? `≈ ${usd(e.rewardPoolGd * s.prices.gdUsd)}` : undefined} />
            <Card title="Item purchases" value={fmt(e.itemPurchases)} sub="NFT weapons and abilities bought with G$" />
            <Card title="Marketplace listings" value={fmt(e.marketplaceListings)} sub="All-time" />
            <Card title="Marketplace sales" value={fmt(e.marketplaceSales)} sub="All-time" />
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Proof — verify on Celo</h2>
        <ul className="mb-4 space-y-1 text-xs">
          {s.contracts.map(c => (
            <li key={c.address}><span className="text-zinc-500">{c.name}: </span>
              <a className="text-emerald-400 underline break-all" href={c.url} target="_blank" rel="noreferrer">{c.address}</a></li>
          ))}
        </ul>
        {s.proof.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900 text-zinc-500"><tr><th className="p-2">Date</th><th className="p-2">Event</th><th className="p-2">G$</th><th className="p-2">Transaction</th></tr></thead>
              <tbody>
                {s.proof.map(p => (
                  <tr key={p.kind + p.txHash} className="border-t border-zinc-800">
                    <td className="p-2 whitespace-nowrap">{p.at.slice(0, 10)}</td>
                    <td className="p-2">{KIND_LABEL[p.kind]}</td>
                    <td className="p-2">{fmt(p.amountGd, 2)}</td>
                    <td className="p-2"><a className="text-emerald-400 underline" href={p.url} target="_blank" rel="noreferrer">{short(p.txHash)}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-xs text-zinc-500">Transaction list unavailable right now.</p>}
      </section>

      <section className="mt-8 text-[11px] leading-relaxed text-zinc-500">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-400">How these are measured</h2>
        <p>Users and activity come from the game database. Verified users are looked up live in GoodDollar&apos;s Identity contract. Transactions, revenue and payouts are read from Celo contract events through the Blockscout explorer, and every purchase, reward and sale above links to its transaction. Figures refresh about every 5 minutes. A figure shows &ldquo;Unavailable&rdquo; instead of 0 when its data source can&apos;t be reached.</p>
        {s.errors.length > 0 && <p className="mt-2 text-amber-600">Data issues: {s.errors.join(' · ')}</p>}
      </section>
    </Shell>
  );
}

function Shell({ children, updated }: { children: React.ReactNode; updated?: string }) {
  return (
    // h-screen + overflow-y-auto (not min-h-screen): globals.css locks html/body (fixed, overflow hidden,
    // touch-action none) for the game, so this element has to be the scroll container itself.
    <main className="h-screen w-full overflow-y-auto overscroll-contain touch-pan-y select-text bg-black px-4 py-8 font-mono text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-yellow-400">FABLE RPG · Live stats</h1>
          <p className="text-xs text-zinc-500">Public, read-only numbers for the GoodBuilders application.{updated && ` Updated ${new Date(updated).toUTCString()}.`}</p>
        </header>
        {children}
      </div>
    </main>
  );
}
