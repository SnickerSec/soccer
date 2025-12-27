-- Fix RLS policies for teams

-- Drop existing team policies
DROP POLICY IF EXISTS "Team members can view teams" ON teams;
DROP POLICY IF EXISTS "Authenticated users can create teams" ON teams;
DROP POLICY IF EXISTS "Team owners can update teams" ON teams;
DROP POLICY IF EXISTS "Team owners can delete teams" ON teams;

-- Recreate with fixed policies
-- Users can view teams they're a member of
CREATE POLICY "Team members can view teams" ON teams
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = teams.id
            AND team_members.user_id = auth.uid()
            AND team_members.joined_at IS NOT NULL
        )
    );

-- Any authenticated user can create a team
CREATE POLICY "Authenticated users can create teams" ON teams
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

-- Team owners can update their teams
CREATE POLICY "Team owners can update teams" ON teams
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = teams.id
            AND team_members.user_id = auth.uid()
            AND team_members.role = 'owner'
            AND team_members.joined_at IS NOT NULL
        )
    );

-- Team owners can delete their teams
CREATE POLICY "Team owners can delete teams" ON teams
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = teams.id
            AND team_members.user_id = auth.uid()
            AND team_members.role = 'owner'
            AND team_members.joined_at IS NOT NULL
        )
    );

-- Fix team_members policies to allow the trigger to insert owner
DROP POLICY IF EXISTS "Owners can invite members" ON team_members;

CREATE POLICY "System and owners can add members" ON team_members
    FOR INSERT WITH CHECK (
        -- Allow the trigger (runs as SECURITY DEFINER)
        auth.uid() IS NULL
        OR
        -- Or team owner inviting
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = team_members.team_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'owner'
            AND tm.joined_at IS NOT NULL
        )
        OR
        -- Or user accepting their own invite
        (user_id = auth.uid() AND invite_token IS NOT NULL)
    );

-- Grant permissions for the trigger to work
GRANT ALL ON public.team_members TO supabase_auth_admin;
GRANT ALL ON public.teams TO supabase_auth_admin;
