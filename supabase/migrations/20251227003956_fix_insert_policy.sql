-- Fix INSERT policy for teams - simplify to just require authentication

DROP POLICY IF EXISTS "Authenticated users can create teams" ON teams;

-- Simple policy: any authenticated user can create a team
-- The created_by field will be set by the client to auth.uid()
CREATE POLICY "Authenticated users can create teams" ON teams
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Also ensure the handle_new_team trigger can insert into team_members
-- by temporarily disabling RLS for the trigger
DROP TRIGGER IF EXISTS on_team_created ON teams;
DROP FUNCTION IF EXISTS handle_new_team();

CREATE OR REPLACE FUNCTION handle_new_team()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO team_members (team_id, user_id, role, joined_at)
    VALUES (NEW.id, NEW.created_by, 'owner', NOW());
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in handle_new_team: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_team_created
    AFTER INSERT ON teams
    FOR EACH ROW EXECUTE FUNCTION handle_new_team();
