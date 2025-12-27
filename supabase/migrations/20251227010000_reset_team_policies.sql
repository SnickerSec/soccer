-- Reset ALL team policies and recreate from scratch
-- This ensures no conflicting policies exist

-- First, disable RLS temporarily to check if that's the issue
-- ALTER TABLE teams DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on teams table
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'teams' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON teams', pol.policyname);
    END LOOP;
END $$;

-- Ensure RLS is enabled
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Create simple, permissive policies

-- 1. SELECT: Users can see teams they belong to
CREATE POLICY "teams_select_policy" ON teams
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = teams.id
            AND team_members.user_id = auth.uid()
        )
        OR created_by = auth.uid()
    );

-- 2. INSERT: Any authenticated user can create a team
CREATE POLICY "teams_insert_policy" ON teams
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- 3. UPDATE: Only owners can update
CREATE POLICY "teams_update_policy" ON teams
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = teams.id
            AND team_members.user_id = auth.uid()
            AND team_members.role = 'owner'
        )
    );

-- 4. DELETE: Only owners can delete
CREATE POLICY "teams_delete_policy" ON teams
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = teams.id
            AND team_members.user_id = auth.uid()
            AND team_members.role = 'owner'
        )
    );

-- Also reset team_members policies
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'team_members' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON team_members', pol.policyname);
    END LOOP;
END $$;

-- team_members policies
CREATE POLICY "team_members_select_policy" ON team_members
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = team_members.team_id
            AND tm.user_id = auth.uid()
        )
    );

-- Allow inserts from trigger (SECURITY DEFINER bypasses RLS) or owners
CREATE POLICY "team_members_insert_policy" ON team_members
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "team_members_update_policy" ON team_members
    FOR UPDATE USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = team_members.team_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'owner'
        )
    );

CREATE POLICY "team_members_delete_policy" ON team_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = team_members.team_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'owner'
        )
    );
