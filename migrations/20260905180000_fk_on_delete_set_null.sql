-- Up Migration

-- team_members.invited_by should null out when the inviting profile is deleted,
-- rather than blocking user deletion with NO ACTION.
ALTER TABLE team_members
    DROP CONSTRAINT IF EXISTS team_members_invited_by_fkey,
    ADD CONSTRAINT team_members_invited_by_fkey
        FOREIGN KEY (invited_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- games.created_by should null out when the creating coach is deleted,
-- rather than blocking user deletion with NO ACTION.
ALTER TABLE games
    DROP CONSTRAINT IF EXISTS games_created_by_fkey,
    ADD CONSTRAINT games_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Down Migration

ALTER TABLE team_members
    DROP CONSTRAINT IF EXISTS team_members_invited_by_fkey,
    ADD CONSTRAINT team_members_invited_by_fkey
        FOREIGN KEY (invited_by) REFERENCES profiles(id);

ALTER TABLE games
    DROP CONSTRAINT IF EXISTS games_created_by_fkey,
    ADD CONSTRAINT games_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES profiles(id);
