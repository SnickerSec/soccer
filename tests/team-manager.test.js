/**
 * Team Manager client module tests.
 *
 * Covers member retrieval, invite links, membership operations,
 * role authorization helpers, and URL token parsing.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

const mockApi = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
};
const mockGetUser = jest.fn();

jest.unstable_mockModule('../src/modules/api-client.js', () => ({
    api: mockApi,
    getUser: mockGetUser
}));

const {
    getTeamMembers,
    generateInviteLink,
    getInviteInfo,
    acceptInvite,
    updateMemberRole,
    removeMember,
    leaveTeam,
    isTeamOwner,
    getTeamRole,
    getInviteTokenFromUrl,
    clearInviteTokenFromUrl
} = await import('../src/modules/team-manager.js');

describe('Team Manager API helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('getTeamMembers requests the team members endpoint', async () => {
        mockApi.get.mockResolvedValue({ success: true, data: [{ userId: 'u1', role: 'owner' }] });

        const result = await getTeamMembers('team-123');

        expect(mockApi.get).toHaveBeenCalledWith('/api/teams/team-123/members');
        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
    });

    test('getTeamMembers catches API errors gracefully', async () => {
        mockApi.get.mockRejectedValue(new Error('Network error'));

        const result = await getTeamMembers('team-123');

        expect(result).toEqual({ success: false, error: 'Network error' });
    });

    test('generateInviteLink posts to invite endpoint with default and custom role', async () => {
        mockApi.post.mockResolvedValue({ success: true, data: { token: 'tok-abc' } });

        await generateInviteLink('team-123');
        expect(mockApi.post).toHaveBeenCalledWith('/api/teams/team-123/invite', { role: 'coach' });

        await generateInviteLink('team-123', 'admin');
        expect(mockApi.post).toHaveBeenCalledWith('/api/teams/team-123/invite', { role: 'admin' });
    });

    test('getInviteInfo gets the encoded invite token', async () => {
        mockApi.get.mockResolvedValue({ success: true, data: { teamName: 'Hawks' } });

        const result = await getInviteInfo('tok/123');

        expect(mockApi.get).toHaveBeenCalledWith('/api/invites/tok%2F123');
        expect(result.data.teamName).toBe('Hawks');
    });

    test('acceptInvite posts acceptance to the invite endpoint', async () => {
        mockApi.post.mockResolvedValue({ success: true, data: { teamId: 'team-123' } });

        const result = await acceptInvite('tok/123');

        expect(mockApi.post).toHaveBeenCalledWith('/api/invites/tok%2F123/accept');
        expect(result.data.teamId).toBe('team-123');
    });

    test('updateMemberRole returns not implemented placeholder', async () => {
        const result = await updateMemberRole('team-123', 'mem-1', 'admin');
        expect(result).toEqual({ success: false, error: 'Not implemented' });
    });

    test('removeMember deletes the member row', async () => {
        mockApi.delete.mockResolvedValue({ success: true });

        const result = await removeMember('team-123', 'mem-1');

        expect(mockApi.delete).toHaveBeenCalledWith('/api/teams/team-123/members/mem-1');
        expect(result.success).toBe(true);
    });

    test('leaveTeam calls the membership endpoint', async () => {
        mockApi.delete.mockResolvedValue({ success: true });

        const result = await leaveTeam('team-123');

        expect(mockApi.delete).toHaveBeenCalledWith('/api/teams/team-123/membership');
        expect(result.success).toBe(true);
    });
});

describe('Role helpers: isTeamOwner & getTeamRole', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('isTeamOwner returns true when user is owner', async () => {
        mockApi.get.mockResolvedValue({
            success: true,
            data: [
                { userId: 'user-alice', role: 'owner' },
                { userId: 'user-bob', role: 'coach' }
            ]
        });
        mockGetUser.mockResolvedValue({ id: 'user-alice' });

        const isOwner = await isTeamOwner('team-1');
        expect(isOwner).toBe(true);
    });

    test('isTeamOwner returns false when user is coach or signed out', async () => {
        mockApi.get.mockResolvedValue({
            success: true,
            data: [{ userId: 'user-bob', role: 'coach' }]
        });
        mockGetUser.mockResolvedValue({ id: 'user-bob' });

        expect(await isTeamOwner('team-1')).toBe(false);

        mockGetUser.mockResolvedValue(null);
        expect(await isTeamOwner('team-1')).toBe(false);
    });

    test('getTeamRole returns the user role or null', async () => {
        mockApi.get.mockResolvedValue({
            success: true,
            data: [
                { userId: 'user-alice', role: 'owner' },
                { userId: 'user-bob', role: 'coach' }
            ]
        });
        mockGetUser.mockResolvedValue({ id: 'user-bob' });

        expect(await getTeamRole('team-1')).toBe('coach');

        mockGetUser.mockResolvedValue({ id: 'user-charlie' });
        expect(await getTeamRole('team-1')).toBeNull();

        mockGetUser.mockResolvedValue(null);
        expect(await getTeamRole('team-1')).toBeNull();
    });
});

describe('Invite URL parameter helpers', () => {
    const originalWindow = globalThis.window;

    afterEach(() => {
        globalThis.window = originalWindow;
    });

    test('getInviteTokenFromUrl extracts token from query string', () => {
        globalThis.window = {
            location: { search: '?invite=token-xyz-123&foo=bar' }
        };

        expect(getInviteTokenFromUrl()).toBe('token-xyz-123');

        globalThis.window.location.search = '?other=123';
        expect(getInviteTokenFromUrl()).toBeNull();
    });

    test('clearInviteTokenFromUrl removes invite param and calls replaceState', () => {
        const replaceState = jest.fn();
        globalThis.window = {
            location: {
                href: 'https://example.test/app?invite=tok-123&tab=roster',
                search: '?invite=tok-123&tab=roster'
            },
            history: { replaceState }
        };

        clearInviteTokenFromUrl();

        expect(replaceState).toHaveBeenCalledWith({}, '', 'https://example.test/app?tab=roster');
    });
});
