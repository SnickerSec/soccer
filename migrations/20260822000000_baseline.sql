-- Baseline: the schema as it stood when migrations were introduced.
--
-- Every statement is guarded (IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS),
-- because this has to be a no-op against the production database, which already
-- has all of it. On an empty database it builds the lot.
--
-- Later migrations are ordinary: write the change, not the whole schema.

-- Up Migration

-- AYSO Roster Pro - PostgreSQL Schema (Railway)
-- Adapted from Supabase schema: no RLS, no auth.users references

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABLES
-- ============================================

-- Profiles table (standalone, no auth.users dependency)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id TEXT UNIQUE,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    age_division TEXT DEFAULT '10U',
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    -- Bumped by every roster write, and by nothing else. A client sends back
    -- the value it last read so a write built on a stale roster is rejected
    -- rather than silently overwriting another coach's edits.
    roster_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members (for sharing)
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'coach', 'viewer')),
    invited_by UUID REFERENCES profiles(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ,
    invite_token TEXT UNIQUE,
    invite_expires_at TIMESTAMPTZ,
    UNIQUE(team_id, user_id)
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    number INTEGER CHECK (number >= 0 AND number <= 99),
    is_captain BOOLEAN DEFAULT FALSE,
    must_rest BOOLEAN DEFAULT FALSE,
    no_keeper BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'injured', 'absent')),
    preferred_positions TEXT[] DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    overall_rating INTEGER CONSTRAINT players_overall_rating_range
        CHECK (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5)),
    positional_ratings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, name)
);

-- Games/Saved lineups table
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    game_date DATE,
    notes TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    lineup JSONB NOT NULL DEFAULT '[]',
    player_snapshot JSONB NOT NULL DEFAULT '[]',
    captains TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    default_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    default_settings JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table for connect-pg-simple
CREATE TABLE IF NOT EXISTS "session" (
    "sid" VARCHAR NOT NULL COLLATE "default",
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ============================================
-- SCHEMA UPGRADES
-- ============================================
--
-- CREATE TABLE IF NOT EXISTS skips a table that already exists, columns and
-- all, so a database created before a column was added never gains it. These
-- repeat the later columns so the baseline lands on an existing database as
-- well as a fresh one. Migrations after this one need no such guard: each runs
-- exactly once.

-- Player ratings: overall_rating is a 1-5 skill level, positional_ratings holds
-- per-position (keeper/defense/midfield/offense) 1-5 scores.
ALTER TABLE players ADD COLUMN IF NOT EXISTS overall_rating INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS positional_ratings JSONB DEFAULT '{}';

-- Roster concurrency: a counter bumped only by roster writes, so a team rename
-- does not invalidate a coach's in-flight roster edit the way updated_at would.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS roster_version BIGINT NOT NULL DEFAULT 1;

-- ADD CONSTRAINT has no IF NOT EXISTS, so swallow the error when it is already
-- there (the fresh-install path defines it inline above).
DO $$
BEGIN
    ALTER TABLE players ADD CONSTRAINT players_overall_rating_range
        CHECK (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_google_id ON profiles(google_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_invited_by ON team_members(invited_by);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_sort ON players(team_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(team_id, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_games_created_by ON games(created_by);
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams(created_by);
CREATE INDEX IF NOT EXISTS idx_user_settings_default_team ON user_settings(default_team_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS profiles_updated ON profiles;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS teams_updated ON teams;
CREATE TRIGGER teams_updated BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS players_updated ON players;
CREATE TRIGGER players_updated BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS games_updated ON games;
CREATE TRIGGER games_updated BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS user_settings_updated ON user_settings;
CREATE TRIGGER user_settings_updated BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-add owner as team member when team is created
CREATE OR REPLACE FUNCTION handle_new_team()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO team_members (team_id, user_id, role, joined_at)
    VALUES (NEW.id, NEW.created_by, 'owner', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_team_created ON teams;
CREATE TRIGGER on_team_created
    AFTER INSERT ON teams
    FOR EACH ROW EXECUTE FUNCTION handle_new_team();

-- Down Migration

-- Reverting the baseline would mean dropping every table in the database,
-- including the production one this migration was written to no-op against.
-- Refusing is the only safe answer; tear down a scratch database by dropping
-- the database itself.
DO $$
BEGIN
    RAISE EXCEPTION 'The baseline migration is not reversible. Drop the database instead.';
END $$;
