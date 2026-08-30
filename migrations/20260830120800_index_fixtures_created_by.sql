-- Up Migration

-- Index foreign key created_by on fixtures table to avoid sequential scans
-- on profile deletions and user joins.
CREATE INDEX IF NOT EXISTS idx_fixtures_created_by ON fixtures(created_by);

-- Down Migration

DROP INDEX IF EXISTS idx_fixtures_created_by;
