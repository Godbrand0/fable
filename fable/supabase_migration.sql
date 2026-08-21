-- ─────────────────────────────────────────────────────────────────────────────
-- Fable RPG — Migration (multiplayer, mode-split leaderboard, campaigns, skins)
-- Run this ONCE in the Supabase SQL Editor against your EXISTING database (the
-- one that already has public.players / public.leaderboard / public.level_reward_claims
-- from the original supabase_schema.sql). It only adds what's new since then —
-- it does not recreate anything that already exists.
-- Safe to re-run: every statement is IF NOT EXISTS / IF EXISTS guarded.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. PLAYERS — character skin ──────────────────────────────────────────────
-- Chosen once at onboarding (see lib/skins.ts for valid ids). Existing players
-- default to 'human', which renders identically to how they looked before this
-- feature shipped.
ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS skin TEXT NOT NULL DEFAULT 'human';


-- ── 2. LEADERBOARD — split into single-player vs multiplayer ────────────────
-- Was one row per wallet; is now one row per (wallet, mode) so the two modes
-- rank separately and a campaign can target just one of them.
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'single';
ALTER TABLE public.leaderboard DROP CONSTRAINT IF EXISTS leaderboard_pkey;
ALTER TABLE public.leaderboard ADD CONSTRAINT leaderboard_pkey PRIMARY KEY (wallet_address, mode);
ALTER TABLE public.leaderboard DROP CONSTRAINT IF EXISTS leaderboard_mode_check;
ALTER TABLE public.leaderboard ADD CONSTRAINT leaderboard_mode_check CHECK (mode IN ('single', 'multiplayer'));

DROP INDEX IF EXISTS idx_leaderboard_score;
CREATE INDEX IF NOT EXISTS idx_leaderboard_mode_score ON public.leaderboard (mode, score DESC);

-- IMPORTANT — run this by hand after reviewing your data: every row in
-- `leaderboard` prior to this migration was written by the multiplayer flow, so
-- the `mode` default of 'single' above is WRONG for existing rows. Either
-- reclassify them:
--   UPDATE public.leaderboard SET mode = 'multiplayer';
-- or, if this table has no real player data yet, just wipe it:
--   TRUNCATE public.leaderboard;


-- ── 3. MULTIPLAYER (co-op lobby + missions) ──────────────────────────────────
-- Player stats/equipment are never duplicated here — every table below only
-- stores session/coordination state; combat-relevant reads always go back to
-- public.players. The *live* lobby roster is carried over Supabase Realtime
-- Presence (channel `party:${partyId}`), not by polling these tables.

CREATE TABLE IF NOT EXISTS public.mp_parties (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT        NOT NULL UNIQUE,
    host_wallet     TEXT        NOT NULL REFERENCES public.players(wallet_address),
    zone            TEXT                 DEFAULT NULL,
    max_players     INTEGER     NOT NULL DEFAULT 3 CHECK (max_players BETWEEN 2 AND 3),
    status          TEXT        NOT NULL DEFAULT 'forming'
                                 CHECK (status IN ('forming', 'ready_check', 'in_mission', 'completed', 'abandoned')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_mp_parties_updated_at ON public.mp_parties;
CREATE TRIGGER trg_mp_parties_updated_at
    BEFORE UPDATE ON public.mp_parties
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mp_parties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mp_parties_select" ON public.mp_parties;
DROP POLICY IF EXISTS "mp_parties_all"    ON public.mp_parties;
CREATE POLICY "mp_parties_select" ON public.mp_parties FOR SELECT USING (true);
CREATE POLICY "mp_parties_all"    ON public.mp_parties FOR ALL   USING (true);

CREATE TABLE IF NOT EXISTS public.mp_party_members (
    party_id        UUID        NOT NULL REFERENCES public.mp_parties(id) ON DELETE CASCADE,
    wallet_address  TEXT        NOT NULL REFERENCES public.players(wallet_address),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_ready        BOOLEAN     NOT NULL DEFAULT false,
    left_at         TIMESTAMPTZ          DEFAULT NULL,

    PRIMARY KEY (party_id, wallet_address)
);

ALTER TABLE public.mp_party_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mp_party_members_select" ON public.mp_party_members;
DROP POLICY IF EXISTS "mp_party_members_all"    ON public.mp_party_members;
CREATE POLICY "mp_party_members_select" ON public.mp_party_members FOR SELECT USING (true);
CREATE POLICY "mp_party_members_all"    ON public.mp_party_members FOR ALL   USING (true);

CREATE TABLE IF NOT EXISTS public.mp_missions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id            UUID        NOT NULL REFERENCES public.mp_parties(id) ON DELETE CASCADE,
    zone                TEXT        NOT NULL,
    participant_wallets TEXT[]      NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at            TIMESTAMPTZ          DEFAULT NULL,
    outcome             TEXT                 DEFAULT NULL CHECK (outcome IN ('cleared', 'wiped', 'abandoned'))
);

ALTER TABLE public.mp_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mp_missions_select" ON public.mp_missions;
DROP POLICY IF EXISTS "mp_missions_all"    ON public.mp_missions;
CREATE POLICY "mp_missions_select" ON public.mp_missions FOR SELECT USING (true);
CREATE POLICY "mp_missions_all"    ON public.mp_missions FOR ALL   USING (true);

CREATE INDEX IF NOT EXISTS idx_mp_parties_code         ON public.mp_parties (code);
CREATE INDEX IF NOT EXISTS idx_mp_parties_status       ON public.mp_parties (status);
CREATE INDEX IF NOT EXISTS idx_mp_party_members_wallet ON public.mp_party_members (wallet_address);
CREATE INDEX IF NOT EXISTS idx_mp_missions_party       ON public.mp_missions (party_id);


-- ── 4. CAMPAIGNS (admin-run prize events, G$ payouts) ────────────────────────
-- Admin-only — RLS is enabled with NO policies below, so these are reachable
-- only via the Supabase service-role key (lib/adminSupabase.ts), never the anon
-- key the rest of the app uses. Winners are decided from the on-chain
-- FableScoreLedger contract (see lib/campaigns.ts), never from the
-- client-writable `leaderboard` table above.

CREATE TABLE IF NOT EXISTS public.campaigns (
    id              BIGINT      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name            TEXT        NOT NULL,
    mode            TEXT        NOT NULL CHECK (mode IN ('single', 'multiplayer', 'both')),
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    top_n           INTEGER     NOT NULL CHECK (top_n > 0 AND top_n <= 20),
    pool_gd         NUMERIC     NOT NULL CHECK (pool_gd > 0),
    status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at         TIMESTAMPTZ,
    CHECK (ends_at > starts_at)
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.campaign_payouts (
    id              BIGINT      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    campaign_id     BIGINT      NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    wallet_address  TEXT        NOT NULL,
    rank            INTEGER     NOT NULL,
    score           NUMERIC     NOT NULL,
    amount_gd       NUMERIC     NOT NULL,
    tx_hash         TEXT        NOT NULL,
    paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, wallet_address)
);
ALTER TABLE public.campaign_payouts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_campaign_payouts_campaign ON public.campaign_payouts (campaign_id);
