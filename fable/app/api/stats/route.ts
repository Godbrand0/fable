import { NextResponse } from 'next/server';
import { getStats, Stats } from '../../../lib/stats';

// Public, read-only. Cached in memory and at the CDN so a busy page can't hammer Supabase or the explorer.
const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; value: Stats } | null = null;

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    cache = { at: Date.now(), value: await getStats() };
  }
  return NextResponse.json(cache.value, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
