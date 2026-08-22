/**
 * The three-way roster merge that runs when the server rejects a stale save.
 *
 * Two coaches can hold one team, and a roster write replaces the whole list.
 * The cases below are the ones that decide whether a coach loses work: what
 * happens to a player one of them added, removed, or edited while the other
 * was doing something else to the same roster.
 */

import { describe, test, expect } from '@jest/globals';
import { mergeRosters } from '../public/modules/roster-merge.js';

/** A player with the fields the merge compares, all defaulted. */
function player(name, overrides = {}) {
    return {
        name,
        number: null,
        isCaptain: false,
        mustRest: false,
        noKeeper: false,
        status: 'available',
        preferredPositions: [],
        sortOrder: 0,
        overallRating: null,
        positionalRatings: {},
        ...overrides
    };
}

const names = (roster) => roster.map(p => p.name);

describe('mergeRosters', () => {
    test('keeps a player this coach added and one the other added', () => {
        const base = [player('Ana')];
        const local = [player('Ana'), player('Ben')];
        const remote = [player('Ana'), player('Cleo')];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        expect(names(merged).sort()).toEqual(['Ana', 'Ben', 'Cleo']);
        expect(conflicts).toEqual([]);
    });

    test('keeps an edit made here and an edit made there to different players', () => {
        const base = [player('Ana'), player('Ben')];
        const local = [player('Ana', { number: 7 }), player('Ben')];
        const remote = [player('Ana'), player('Ben', { isCaptain: true })];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        expect(merged.find(p => p.name === 'Ana').number).toBe(7);
        expect(merged.find(p => p.name === 'Ben').isCaptain).toBe(true);
        expect(conflicts).toEqual([]);
    });

    test('honours a local removal the other coach did not touch', () => {
        const base = [player('Ana'), player('Ben')];
        const local = [player('Ana')];
        const remote = [player('Ana'), player('Ben')];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        expect(names(merged)).toEqual(['Ana']);
        expect(conflicts).toEqual([]);
    });

    test('does not resurrect a player the other coach removed', () => {
        const base = [player('Ana'), player('Ben')];
        const local = [player('Ana'), player('Ben')];
        const remote = [player('Ana')];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        expect(names(merged)).toEqual(['Ana']);
        expect(conflicts).toEqual([]);
    });

    test('flags a local removal racing the other coach editing that player', () => {
        const base = [player('Ana'), player('Ben')];
        const local = [player('Ana')];
        const remote = [player('Ana'), player('Ben', { status: 'injured' })];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        // Kept, not deleted: dropping a player another coach just marked
        // injured is the harder mistake to notice and undo.
        expect(names(merged)).toContain('Ben');
        expect(conflicts).toEqual(['Ben']);
    });

    test('flags a local edit racing the other coach removing that player', () => {
        const base = [player('Ana'), player('Ben')];
        const local = [player('Ana'), player('Ben', { number: 9 })];
        const remote = [player('Ana')];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        expect(merged.find(p => p.name === 'Ben').number).toBe(9);
        expect(conflicts).toEqual(['Ben']);
    });

    test('flags both sides editing the same player differently', () => {
        const base = [player('Ana')];
        const local = [player('Ana', { number: 7 })];
        const remote = [player('Ana', { number: 8 })];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        expect(conflicts).toEqual(['Ana']);
        // The other coach's value stands, so saving without asking preserves
        // what is already on the server rather than inventing a third answer
        expect(merged.find(p => p.name === 'Ana').number).toBe(8);
    });

    test('says nothing when both sides made the identical edit', () => {
        const base = [player('Ana')];
        const local = [player('Ana', { number: 7 })];
        const remote = [player('Ana', { number: 7 })];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        expect(conflicts).toEqual([]);
        expect(merged.find(p => p.name === 'Ana').number).toBe(7);
    });

    test('treats both coaches adding the same name as one player', () => {
        const base = [];
        const local = [player('Ana', { number: 7 })];
        const remote = [player('Ana', { number: 8 })];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        expect(names(merged)).toEqual(['Ana']);
        expect(conflicts).toEqual(['Ana']);
    });

    test('a reorder on both sides is not a conflict', () => {
        const base = [player('Ana', { sortOrder: 0 }), player('Ben', { sortOrder: 1 })];
        const local = [player('Ben', { sortOrder: 0 }), player('Ana', { sortOrder: 1 })];
        const remote = [player('Ana', { sortOrder: 1 }), player('Ben', { sortOrder: 0 })];

        const { conflicts } = mergeRosters({ base, local, remote });

        expect(conflicts).toEqual([]);
    });

    test('renumbers sortOrder so the result is not two sides interleaved', () => {
        const base = [player('Ana')];
        const local = [player('Ana'), player('Ben', { sortOrder: 5 })];
        const remote = [player('Ana'), player('Cleo', { sortOrder: 5 })];

        const { merged } = mergeRosters({ base, local, remote });

        expect(merged.map(p => p.sortOrder)).toEqual([0, 1, 2]);
    });

    test('does not mutate the rosters handed in', () => {
        const base = [player('Ana')];
        const local = [player('Ana'), player('Ben', { sortOrder: 5 })];
        const remote = [player('Ana')];

        mergeRosters({ base, local, remote });

        expect(local.find(p => p.name === 'Ben').sortOrder).toBe(5);
    });

    test('compares array and object fields by value, not identity', () => {
        const base = [player('Ana', { preferredPositions: ['Keeper'] })];
        const local = [player('Ana', { preferredPositions: ['Keeper'] })];
        const remote = [player('Ana', { preferredPositions: ['Keeper'] })];

        const { conflicts } = mergeRosters({ base, local, remote });

        expect(conflicts).toEqual([]);
    });

    test('ignores the id the server adds but the local copy has not got', () => {
        const base = [player('Ana')];
        const local = [player('Ana')];
        const remote = [{ ...player('Ana'), id: 'server-side-uuid' }];

        const { conflicts } = mergeRosters({ base, local, remote });

        expect(conflicts).toEqual([]);
    });

    test('an empty local roster removes everyone the other coach left alone', () => {
        const base = [player('Ana'), player('Ben')];
        const local = [];
        const remote = [player('Ana'), player('Ben')];

        const { merged, conflicts } = mergeRosters({ base, local, remote });

        expect(merged).toEqual([]);
        expect(conflicts).toEqual([]);
    });

    test('survives a missing base, which is what an offline queue entry has', () => {
        const local = [player('Ana'), player('Ben')];
        const remote = [player('Cleo')];

        const { merged } = mergeRosters({ base: undefined, local, remote });

        // With no base, nothing can be read as a removal — everyone is kept
        expect(names(merged).sort()).toEqual(['Ana', 'Ben', 'Cleo']);
    });
});
