-- ─────────────────────────────────────────────────────────────────────────────
-- Fable RPG — Security migration
-- Run ONCE in the Supabase SQL Editor against the existing database, AFTER
-- deploying the app version that saves profiles through /api/player (otherwise
-- profile saves from the old client will start failing).
-- Safe to re-run: every statement is IF EXISTS / IF NOT EXISTS guarded.
--
-- What it does:
--   1. players / leaderboard / level_reward_claims become read-only for the
--      browser's anon key. All writes now go through API routes that check the
--      player's signed-in wallet session and use the service-role key.
--   2. campaigns can be locked while a payout runs ('distributing'), and
--      campaign_payouts rows can be reserved before the G$ transfer is sent
--      (tx_hash filled in once broadcast).
--   3. celo_fundings records which wallets received gas funding. Its primary key
--      makes "fund this wallet once" atomic, and it backs the daily funding cap.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Read-only anon access ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "players_insert" ON public.players;
DROP POLICY IF EXISTS "players_update" ON public.players;
-- players_select (USING true) stays: profiles are public game data.

DROP POLICY IF EXISTS "leaderboard_all" ON public.leaderboard;
-- leaderboard_select (USING true) stays.

DROP POLICY IF EXISTS "claims_insert" ON public.level_reward_claims;
-- claims_select (USING true) stays.


-- ── 2. Campaign payout locking ───────────────────────────────────────────────
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check
    CHECK (status IN ('pending', 'distributing', 'paid', 'failed'));

ALTER TABLE public.campaign_payouts ALTER COLUMN tx_hash DROP NOT NULL;


-- ── 3. Gas funding ledger ────────────────────────────────────────────────────
-- Service-role only: RLS enabled with no policies.
CREATE TABLE IF NOT EXISTS public.celo_fundings (
    wallet_address  TEXT        PRIMARY KEY,
    tx_hash         TEXT,
    funded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.celo_fundings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_celo_fundings_funded_at ON public.celo_fundings (funded_at);

-- Wallets funded under the old flow shouldn't be funded again. Dated in the past so
-- they don't count against today's cap.
INSERT INTO public.celo_fundings (wallet_address, funded_at)
SELECT wallet_address, created_at FROM public.players WHERE celo_funded = true
ON CONFLICT (wallet_address) DO NOTHING;
