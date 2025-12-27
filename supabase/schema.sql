-- AYSO Roster Pro - Supabase Schema
-- Run this in your Supabase SQL Editor to set up the database

-- ============================================
-- TABLES
-- ============================================

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams table
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    age_division TEXT DEFAULT '10U',
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members (for sharing)
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'coach', 'viewer')),
    invited_by UUID REFERENCES profiles(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ,
    invite_token TEXT UNIQUE,
    invite_expires_at TIMESTAMPTZ,
    UNIQUE(team_id, user_id)
);

-- Players table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    number INTEGER CHECK (number >= 0 AND number <= 99),
    is_captain BOOLEAN DEFAULT FALSE,
    must_rest BOOLEAN DEFAULT FALSE,
    no_keeper BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'injured', 'absent')),
    preferred_positions TEXT[] DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, name)
);

-- Games/Saved lineups table
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    game_date DATE,
    notes TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    lineup JSONB NOT NULL DEFAULT '[]',
    player_snapshot JSONB NOT NULL DEFAULT '[]',
    captains TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User settings table
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    default_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    default_settings JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_players_team ON players(team_id);
CREATE INDEX idx_players_sort ON players(team_id, sort_order);
CREATE INDEX idx_games_date ON games(team_id, game_date DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Apply updated_at triggers
CREATE TRIGGER profiles_updated BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER teams_updated BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER players_updated BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER games_updated BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_settings_updated BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    );

    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-add owner as team member when team is created
CREATE OR REPLACE FUNCTION handle_new_team()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.team_members (team_id, user_id, role, joined_at)
    VALUES (NEW.id, NEW.created_by, 'owner', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_team_created
    AFTER INSERT ON teams
    FOR EACH ROW EXECUTE FUNCTION handle_new_team();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check team access
CREATE OR REPLACE FUNCTION user_has_team_access(team_uuid UUID, required_role TEXT DEFAULT 'viewer')
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.team_members
    WHERE team_id = team_uuid
      AND user_id = auth.uid()
      AND joined_at IS NOT NULL;

    IF user_role IS NULL THEN RETURN FALSE; END IF;
    IF required_role = 'viewer' THEN RETURN TRUE; END IF;
    IF required_role = 'coach' THEN RETURN user_role IN ('coach', 'owner'); END IF;
    IF required_role = 'owner' THEN RETURN user_role = 'owner'; END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING ((select auth.uid()) = id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING ((select auth.uid()) = id);

-- Teams policies (simple, based on created_by)
CREATE POLICY "teams_select" ON teams
    FOR SELECT TO authenticated
    USING (created_by = (select auth.uid()));
CREATE POLICY "teams_insert" ON teams
    FOR INSERT TO authenticated
    WITH CHECK (created_by = (select auth.uid()));
CREATE POLICY "teams_update" ON teams
    FOR UPDATE TO authenticated
    USING (created_by = (select auth.uid()));
CREATE POLICY "teams_delete" ON teams
    FOR DELETE TO authenticated
    USING (created_by = (select auth.uid()));

-- Team members policies (simple, based on user_id)
CREATE POLICY "team_members_select" ON team_members
    FOR SELECT TO authenticated
    USING (user_id = (select auth.uid()));
CREATE POLICY "team_members_insert" ON team_members
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "team_members_update" ON team_members
    FOR UPDATE TO authenticated
    USING (user_id = (select auth.uid()));
CREATE POLICY "team_members_delete" ON team_members
    FOR DELETE TO authenticated
    USING (user_id = (select auth.uid()));

-- Players policies
CREATE POLICY "Team members can view players" ON players
    FOR SELECT USING (user_has_team_access(team_id, 'viewer'));
CREATE POLICY "Coaches can add players" ON players
    FOR INSERT WITH CHECK (user_has_team_access(team_id, 'coach'));
CREATE POLICY "Coaches can update players" ON players
    FOR UPDATE USING (user_has_team_access(team_id, 'coach'));
CREATE POLICY "Coaches can delete players" ON players
    FOR DELETE USING (user_has_team_access(team_id, 'coach'));

-- Games policies
CREATE POLICY "Team members can view games" ON games
    FOR SELECT USING (user_has_team_access(team_id, 'viewer'));
CREATE POLICY "Coaches can add games" ON games
    FOR INSERT WITH CHECK (user_has_team_access(team_id, 'coach'));
CREATE POLICY "Coaches can update games" ON games
    FOR UPDATE USING (user_has_team_access(team_id, 'coach'));
CREATE POLICY "Coaches can delete games" ON games
    FOR DELETE USING (user_has_team_access(team_id, 'coach'));

-- User settings policies
CREATE POLICY "Users can manage own settings" ON user_settings
    FOR ALL USING ((select auth.uid()) = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate invite token
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(extensions.gen_random_bytes(24), 'base64');
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Create team invite
CREATE OR REPLACE FUNCTION create_team_invite(
    p_team_id UUID,
    p_role TEXT DEFAULT 'coach',
    p_expires_in INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
BEGIN
    -- Check if user is team owner
    IF NOT public.user_has_team_access(p_team_id, 'owner') THEN
        RAISE EXCEPTION 'Only team owners can create invites';
    END IF;

    v_token := public.generate_invite_token();

    INSERT INTO public.team_members (team_id, role, invite_token, invite_expires_at, invited_by)
    VALUES (p_team_id, p_role, v_token, NOW() + p_expires_in, auth.uid());

    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Accept team invite
CREATE OR REPLACE FUNCTION accept_team_invite(p_token TEXT)
RETURNS UUID AS $$
DECLARE
    v_team_id UUID;
    v_member_id UUID;
BEGIN
    -- Find and validate invite
    SELECT id, team_id INTO v_member_id, v_team_id
    FROM public.team_members
    WHERE invite_token = p_token
      AND invite_expires_at > NOW()
      AND joined_at IS NULL;

    IF v_member_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired invite';
    END IF;

    -- Check if user already a member
    IF EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_id = v_team_id
          AND user_id = auth.uid()
          AND joined_at IS NOT NULL
    ) THEN
        -- Delete the unused invite
        DELETE FROM public.team_members WHERE id = v_member_id;
        RAISE EXCEPTION 'Already a member of this team';
    END IF;

    -- Accept invite
    UPDATE public.team_members
    SET user_id = auth.uid(),
        joined_at = NOW(),
        invite_token = NULL,
        invite_expires_at = NULL
    WHERE id = v_member_id;

    RETURN v_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Get team info for invite token (public, no auth required)
CREATE OR REPLACE FUNCTION get_invite_info(p_token TEXT)
RETURNS TABLE (team_name TEXT, role TEXT, invited_by_name TEXT, expires_at TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.name,
        tm.role,
        p.display_name,
        tm.invite_expires_at
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    LEFT JOIN public.profiles p ON p.id = tm.invited_by
    WHERE tm.invite_token = p_token
      AND tm.invite_expires_at > NOW()
      AND tm.joined_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
