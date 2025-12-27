-- Add indexes for foreign keys that are missing coverage
-- This improves JOIN and DELETE performance

-- games.created_by
CREATE INDEX IF NOT EXISTS idx_games_created_by ON games(created_by);

-- team_members.invited_by
CREATE INDEX IF NOT EXISTS idx_team_members_invited_by ON team_members(invited_by);

-- team_members.user_id
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- teams.created_by
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams(created_by);

-- user_settings.default_team_id
CREATE INDEX IF NOT EXISTS idx_user_settings_default_team ON user_settings(default_team_id);
