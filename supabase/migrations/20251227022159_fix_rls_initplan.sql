-- Fix RLS policies to use (select auth.uid()) for better performance
-- This prevents auth.uid() from being re-evaluated for each row

-- =====================
-- PROFILES
-- =====================
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING ((select auth.uid()) = id);

-- =====================
-- USER_SETTINGS
-- =====================
DROP POLICY IF EXISTS "Users can manage own settings" ON user_settings;
CREATE POLICY "Users can manage own settings" ON user_settings
    FOR ALL USING ((select auth.uid()) = user_id);

-- =====================
-- TEAMS
-- =====================
DROP POLICY IF EXISTS "teams_select" ON teams;
CREATE POLICY "teams_select" ON teams
    FOR SELECT TO authenticated
    USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "teams_insert" ON teams;
CREATE POLICY "teams_insert" ON teams
    FOR INSERT TO authenticated
    WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "teams_update" ON teams;
CREATE POLICY "teams_update" ON teams
    FOR UPDATE TO authenticated
    USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "teams_delete" ON teams;
CREATE POLICY "teams_delete" ON teams
    FOR DELETE TO authenticated
    USING (created_by = (select auth.uid()));

-- =====================
-- TEAM_MEMBERS
-- =====================
DROP POLICY IF EXISTS "team_members_select" ON team_members;
CREATE POLICY "team_members_select" ON team_members
    FOR SELECT TO authenticated
    USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "team_members_insert" ON team_members;
CREATE POLICY "team_members_insert" ON team_members
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "team_members_update" ON team_members;
CREATE POLICY "team_members_update" ON team_members
    FOR UPDATE TO authenticated
    USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "team_members_delete" ON team_members;
CREATE POLICY "team_members_delete" ON team_members
    FOR DELETE TO authenticated
    USING (user_id = (select auth.uid()));
