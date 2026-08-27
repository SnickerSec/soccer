-- Up Migration

-- Fixtures table for season schedule and volunteer duty tracking
CREATE TABLE IF NOT EXISTS fixtures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    game_date DATE NOT NULL,
    game_time TEXT,
    opponent TEXT NOT NULL,
    location TEXT,
    home_away TEXT DEFAULT 'home' CHECK (home_away IN ('home', 'away')),
    jersey_color TEXT,
    snack_parent TEXT,
    fruit_parent TEXT,
    referee_duty TEXT,
    field_setup TEXT,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'canceled')),
    notes TEXT,
    game_id UUID REFERENCES games(id) ON DELETE SET NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying team fixtures sorted by date
CREATE INDEX IF NOT EXISTS idx_fixtures_team ON fixtures(team_id, game_date ASC);
CREATE INDEX IF NOT EXISTS idx_fixtures_game_id ON fixtures(game_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS fixtures_updated ON fixtures;
CREATE TRIGGER fixtures_updated BEFORE UPDATE ON fixtures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS fixtures_updated ON fixtures;
DROP TABLE IF EXISTS fixtures;
