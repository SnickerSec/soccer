-- Simplest possible RLS - no cross-table references to avoid recursion

-- Drop ALL existing policies on both tables
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

-- =====================
-- TEAMS - Simple policies based only on created_by
-- =====================

-- Anyone authenticated can see teams they created
CREATE POLICY "teams_select" ON teams
    FOR SELECT TO authenticated
    USING (created_by = auth.uid());

-- Anyone authenticated can create a team (must set created_by to their uid)
CREATE POLICY "teams_insert" ON teams
    FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

-- Only creator can update
CREATE POLICY "teams_update" ON teams
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid());

-- Only creator can delete
CREATE POLICY "teams_delete" ON teams
    FOR DELETE TO authenticated
    USING (created_by = auth.uid());

-- =====================
-- TEAM_MEMBERS - Simple policies, no references to teams table
-- =====================

-- Users can see their own memberships
CREATE POLICY "team_members_select" ON team_members
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Allow inserts (trigger uses SECURITY DEFINER to bypass RLS)
-- For direct inserts, user can only add themselves
CREATE POLICY "team_members_insert" ON team_members
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users can update their own membership (e.g., accept invite)
CREATE POLICY "team_members_update" ON team_members
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

-- Users can remove themselves from a team
CREATE POLICY "team_members_delete" ON team_members
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Ensure the trigger function has SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION handle_new_team()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO team_members (team_id, user_id, role, joined_at)
    VALUES (NEW.id, NEW.created_by, 'owner', NOW());
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'handle_new_team error: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;
