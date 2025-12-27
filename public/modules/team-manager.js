/**
 * Team Manager Module
 * Handles team sharing, invitations, and member management
 */

import { getSupabase, getUser } from './supabase.js';
import { getTeams, createTeam, updateTeam, deleteTeam } from './cloud-storage.js';

/**
 * Get team members for a team
 * @param {string} teamId
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function getTeamMembers(teamId) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { data, error } = await supabase
            .from('team_members')
            .select(`
                id,
                role,
                joined_at,
                profiles (
                    id,
                    email,
                    display_name,
                    avatar_url
                )
            `)
            .eq('team_id', teamId)
            .not('joined_at', 'is', null)
            .order('role', { ascending: true });

        if (error) {
            return { success: false, error: error.message };
        }

        const members = data.map(m => ({
            id: m.id,
            role: m.role,
            joinedAt: m.joined_at,
            userId: m.profiles?.id,
            email: m.profiles?.email,
            displayName: m.profiles?.display_name,
            avatarUrl: m.profiles?.avatar_url
        }));

        return { success: true, data: members };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Generate an invite link for a team
 * @param {string} teamId
 * @param {string} role - 'coach' or 'viewer'
 * @returns {Promise<{success: boolean, data?: {token: string, url: string}, error?: string}>}
 */
export async function generateInviteLink(teamId, role = 'coach') {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        // Call the database function to create invite
        const { data, error } = await supabase.rpc('create_team_invite', {
            p_team_id: teamId,
            p_role: role
        });

        if (error) {
            return { success: false, error: error.message };
        }

        const token = data;
        const url = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(token)}`;

        return {
            success: true,
            data: { token, url }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get invite info from a token
 * @param {string} token
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function getInviteInfo(token) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Cloud sync not configured' };
    }

    try {
        const { data, error } = await supabase.rpc('get_invite_info', {
            p_token: token
        });

        if (error) {
            return { success: false, error: error.message };
        }

        if (!data || data.length === 0) {
            return { success: false, error: 'Invalid or expired invite' };
        }

        const invite = data[0];
        return {
            success: true,
            data: {
                teamName: invite.team_name,
                role: invite.role,
                invitedBy: invite.invited_by_name,
                expiresAt: invite.expires_at
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Accept a team invite
 * @param {string} token
 * @returns {Promise<{success: boolean, data?: {teamId: string}, error?: string}>}
 */
export async function acceptInvite(token) {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { data, error } = await supabase.rpc('accept_team_invite', {
            p_token: token
        });

        if (error) {
            return { success: false, error: error.message };
        }

        return {
            success: true,
            data: { teamId: data }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update a team member's role
 * @param {string} teamId
 * @param {string} memberId
 * @param {string} newRole
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateMemberRole(teamId, memberId, newRole) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('team_members')
            .update({ role: newRole })
            .eq('id', memberId)
            .eq('team_id', teamId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Remove a member from a team
 * @param {string} teamId
 * @param {string} memberId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function removeMember(teamId, memberId) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('team_members')
            .delete()
            .eq('id', memberId)
            .eq('team_id', teamId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Leave a team (remove self)
 * @param {string} teamId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function leaveTeam(teamId) {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('team_members')
            .delete()
            .eq('team_id', teamId)
            .eq('user_id', user.id);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Check if current user is owner of a team
 * @param {string} teamId
 * @returns {Promise<boolean>}
 */
export async function isTeamOwner(teamId) {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return false;
    }

    try {
        const { data, error } = await supabase
            .from('team_members')
            .select('role')
            .eq('team_id', teamId)
            .eq('user_id', user.id)
            .single();

        if (error || !data) {
            return false;
        }

        return data.role === 'owner';
    } catch (error) {
        return false;
    }
}

/**
 * Get the user's role for a team
 * @param {string} teamId
 * @returns {Promise<string|null>}
 */
export async function getTeamRole(teamId) {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return null;
    }

    try {
        const { data, error } = await supabase
            .from('team_members')
            .select('role')
            .eq('team_id', teamId)
            .eq('user_id', user.id)
            .single();

        if (error || !data) {
            return null;
        }

        return data.role;
    } catch (error) {
        return null;
    }
}

/**
 * Check for invite token in URL and return it
 * @returns {string|null}
 */
export function getInviteTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('invite');
}

/**
 * Clear invite token from URL
 */
export function clearInviteTokenFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.toString());
}

// Re-export team CRUD functions for convenience
export { getTeams, createTeam, updateTeam, deleteTeam };
