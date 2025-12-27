-- Fix circular RLS dependency causing 500 errors
-- The issue is that teams policy references team_members and vice versa

-- Drop all existing policies
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE tablename IN ('teams', 'team_members') AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- TEAMS policies - use created_by for SELECT to avoid circular dependency
CREATE POLICY "teams_select" ON teams
    FOR SELECT USING (
        created_by = auth.uid()
        OR id IN (
            SELECT team_id FROM team_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "teams_insert" ON teams
    FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "teams_update" ON teams
    FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "teams_delete" ON teams
    FOR DELETE USING (created_by = auth.uid());

-- TEAM_MEMBERS policies - simple, non-circular
CREATE POLICY "team_members_select" ON team_members
    FOR SELECT USING (
        user_id = auth.uid()
        OR team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
    );

CREATE POLICY "team_members_insert" ON team_members
    FOR INSERT TO authenticated
    WITH CHECK (
        -- User can add themselves (accepting invite)
        user_id = auth.uid()
        -- Or owner can add members
        OR team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
    );

CREATE POLICY "team_members_update" ON team_members
    FOR UPDATE USING (
        user_id = auth.uid()
        OR team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
    );

CREATE POLICY "team_members_delete" ON team_members
    FOR DELETE USING (
        team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
    );
