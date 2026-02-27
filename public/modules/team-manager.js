/**
 * Team Manager Module
 * Handles team sharing, invitations, and member management
 */

import { api, getUser } from './api-client.js';
import { getTeams, createTeam, updateTeam, deleteTeam } from './cloud-storage.js';

/**
 * Get team members for a team
 */
export async function getTeamMembers(teamId) {
    try {
        return await api.get(`/api/teams/${teamId}/members`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Generate an invite link for a team
 */
export async function generateInviteLink(teamId, role = 'coach') {
    try {
        return await api.post(`/api/teams/${teamId}/invite`, { role });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get invite info from a token
 */
export async function getInviteInfo(token) {
    try {
        return await api.get(`/api/invites/${encodeURIComponent(token)}`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Accept a team invite
 */
export async function acceptInvite(token) {
    try {
        return await api.post(`/api/invites/${encodeURIComponent(token)}/accept`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update a team member's role
 */
export async function updateMemberRole(teamId, memberId, newRole) {
    // Not yet implemented in API — placeholder
    return { success: false, error: 'Not implemented' };
}

/**
 * Remove a member from a team
 */
export async function removeMember(teamId, memberId) {
    try {
        return await api.delete(`/api/teams/${teamId}/members/${memberId}`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Leave a team (remove self)
 */
export async function leaveTeam(teamId) {
    // Find own membership and remove
    const user = await getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        const membersResult = await getTeamMembers(teamId);
        if (!membersResult.success) return membersResult;

        const self = membersResult.data.find(m => m.userId === user.id);
        if (!self) return { success: false, error: 'Not a member' };

        return await removeMember(teamId, self.id);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Check if current user is owner of a team
 */
export async function isTeamOwner(teamId) {
    try {
        const result = await getTeamMembers(teamId);
        if (!result.success) return false;

        const user = await getUser();
        if (!user) return false;

        const self = result.data.find(m => m.userId === user.id);
        return self?.role === 'owner';
    } catch (error) {
        return false;
    }
}

/**
 * Get the user's role for a team
 */
export async function getTeamRole(teamId) {
    try {
        const result = await getTeamMembers(teamId);
        if (!result.success) return null;

        const user = await getUser();
        if (!user) return null;

        const self = result.data.find(m => m.userId === user.id);
        return self?.role || null;
    } catch (error) {
        return null;
    }
}

/**
 * Check for invite token in URL and return it
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
