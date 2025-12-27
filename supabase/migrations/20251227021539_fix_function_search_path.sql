-- Fix function search_path security warnings
-- All functions need SET search_path = '' to prevent search_path injection attacks

-- 1. update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- 2. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
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

-- 3. handle_new_team
CREATE OR REPLACE FUNCTION public.handle_new_team()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.team_members (team_id, user_id, role, joined_at)
    VALUES (NEW.id, NEW.created_by, 'owner', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. user_has_team_access
CREATE OR REPLACE FUNCTION public.user_has_team_access(team_uuid UUID, required_role TEXT DEFAULT 'viewer')
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

-- 5. generate_invite_token
CREATE OR REPLACE FUNCTION public.generate_invite_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(extensions.gen_random_bytes(24), 'base64');
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- 6. create_team_invite
CREATE OR REPLACE FUNCTION public.create_team_invite(
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

-- 7. accept_team_invite
CREATE OR REPLACE FUNCTION public.accept_team_invite(p_token TEXT)
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

-- 8. get_invite_info
CREATE OR REPLACE FUNCTION public.get_invite_info(p_token TEXT)
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
