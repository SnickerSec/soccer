-- Enable pgcrypto extension for gen_random_bytes function
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recreate generate_invite_token function to use pgcrypto
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(extensions.gen_random_bytes(24), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Drop unused custom indexes (not primary keys or unique constraints)
-- These indexes have 0 scans and are taking up space

-- idx_games_team - redundant, queries use idx_games_date instead
DROP INDEX IF EXISTS idx_games_team;

-- idx_team_members_user - not being used for lookups
DROP INDEX IF EXISTS idx_team_members_user;

-- idx_team_members_invite - not being used (invite lookups use unique constraint)
DROP INDEX IF EXISTS idx_team_members_invite;
