import { describe, test, expect } from '@jest/globals';
import {
    buildRecommendationsHtml,
    buildGameHistoryHtml,
    buildPlayerStatsHtml,
    buildSeasonStatsCsv,
    rankPlayersByGames
} from '../public/modules/season-render.js';

/** A stats entry with sensible zeros, overridden per test. */
function playerStats(overrides = {}) {
    return {
        gamesPlayed: 1,
        gamesAttended: 1,
        gamesOnRoster: 1,
        gamesAbsent: 0,
        gamesInjured: 0,
        totalQuarters: 4,
        totalSitting: 0,
        goalkeeperQuarters: 0,
        captainGames: 0,
        positions: {},
        ...overrides
    };
}

describe('buildRecommendationsHtml', () => {
    const empty = {
        shouldSit: [], shouldKeep: [], shouldCaptain: [],
        needsOffense: [], needsDefense: [], positionVariety: []
    };

    test('returns null when there is nothing to recommend', () => {
        expect(buildRecommendationsHtml(null)).toBeNull();
        expect(buildRecommendationsHtml(empty)).toBeNull();
    });

    test('renders only the sections that have players', () => {
        const html = buildRecommendationsHtml({
            ...empty,
            shouldKeep: [{ name: 'Ada', gkCount: 0 }]
        });

        expect(html).toContain('Goalkeeper Priority');
        expect(html).toContain('Ada');
        expect(html).toContain('0 GK games');
        expect(html).not.toContain('Should Sit More');
        expect(html).not.toContain('Captain Priority');
    });

    test('escapes player names', () => {
        const html = buildRecommendationsHtml({
            ...empty,
            shouldSit: [{ name: '<img src=x onerror=alert(1)>', avgSitting: 2 }]
        });

        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    test('escapes the position list in the variety section', () => {
        const html = buildRecommendationsHtml({
            ...empty,
            positionVariety: [{ name: 'Bo', positionCount: 1, topPositions: '<b>GK</b>' }]
        });

        expect(html).not.toContain('<b>GK</b>');
        expect(html).toContain('&lt;b&gt;');
    });

    test('falls back to "none" when a player has no positions', () => {
        const html = buildRecommendationsHtml({
            ...empty,
            positionVariety: [{ name: 'Cy', positionCount: 0, topPositions: '' }]
        });

        expect(html).toContain('(none)');
    });
});

describe('buildGameHistoryHtml', () => {
    const game = (overrides = {}) => ({
        id: 1,
        name: 'vs Tigers',
        date: '2026-03-01T00:00:00.000Z',
        notes: '',
        players: [{ name: 'Ada', status: 'available' }],
        settings: { formation: '2-3-1', ageDivision: '10U' },
        ...overrides
    });

    test('orders games newest first', () => {
        const html = buildGameHistoryHtml([
            game({ id: 1, name: 'Older', date: '2026-03-01T00:00:00.000Z' }),
            game({ id: 2, name: 'Newer', date: '2026-04-01T00:00:00.000Z' })
        ]);

        expect(html.indexOf('Newer')).toBeLessThan(html.indexOf('Older'));
    });

    test('counts only available players', () => {
        const html = buildGameHistoryHtml([game({
            players: [
                { name: 'Ada', status: 'available' },
                { name: 'Bo', status: 'absent' }
            ]
        })]);

        expect(html).toContain('1 players');
    });

    test('omits the notes element when there are no notes', () => {
        expect(buildGameHistoryHtml([game()])).not.toContain('game-notes');
        expect(buildGameHistoryHtml([game({ notes: 'Won 3-1' })])).toContain('Won 3-1');
    });

    test('escapes names, notes and ids', () => {
        const html = buildGameHistoryHtml([game({
            name: '"><script>alert(1)</script>',
            notes: '<b>x</b>'
        })]);

        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<b>x</b>');
    });
});

describe('rankPlayersByGames', () => {
    test('drops players with no games and sorts by games then name', () => {
        const stats = {
            Zoe: playerStats({ gamesPlayed: 2 }),
            Ada: playerStats({ gamesPlayed: 2 }),
            Bo: playerStats({ gamesPlayed: 5 }),
            Never: playerStats({ gamesPlayed: 0 })
        };

        expect(rankPlayersByGames(stats)).toEqual(['Bo', 'Ada', 'Zoe']);
    });
});

describe('buildPlayerStatsHtml', () => {
    test('returns null when nobody has played', () => {
        expect(buildPlayerStatsHtml({})).toBeNull();
        expect(buildPlayerStatsHtml({ Ada: playerStats({ gamesPlayed: 0 }) })).toBeNull();
    });

    test('computes sitting percentage against four quarters per game', () => {
        const html = buildPlayerStatsHtml({
            Ada: playerStats({ gamesPlayed: 2, totalQuarters: 6, totalSitting: 2 })
        });

        // 2 sitting of 8 possible quarters
        expect(html).toContain('25%');
    });

    test('shows attendance as attended/on-roster', () => {
        const html = buildPlayerStatsHtml({
            Ada: playerStats({ gamesPlayed: 3, gamesAttended: 3, gamesOnRoster: 5 })
        });

        expect(html).toContain('3/5');
    });

    test('lists at most three positions, most played first', () => {
        const html = buildPlayerStatsHtml({
            Ada: playerStats({ positions: { GK: 1, LB: 5, RB: 3, MID: 4 } })
        });

        expect(html).toContain('LB (5)');
        expect(html).toContain('MID (4)');
        expect(html).toContain('RB (3)');
        expect(html).not.toContain('GK (1)');
    });

    test('escapes player names', () => {
        const html = buildPlayerStatsHtml({ '<script>x</script>': playerStats() });
        expect(html).not.toContain('<script>');
    });
});

describe('buildSeasonStatsCsv', () => {
    test('returns null when nobody has played', () => {
        expect(buildSeasonStatsCsv({})).toBeNull();
    });

    test('emits a header row and one row per player', () => {
        const csv = buildSeasonStatsCsv({
            Ada: playerStats({ gamesPlayed: 2 }),
            Bo: playerStats({ gamesPlayed: 1 })
        });

        const lines = csv.split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toContain('Player');
        expect(lines[0]).toContain('Top Positions');
        // Ordered by games played, descending
        expect(lines[1]).toContain('Ada');
        expect(lines[2]).toContain('Bo');
    });

    test('quotes every cell so commas in data cannot shift columns', () => {
        const csv = buildSeasonStatsCsv({
            'Smith, Ada': playerStats({ positions: { GK: 1, LB: 2 } })
        });

        const dataRow = csv.split('\n')[1];
        expect(dataRow).toContain('"Smith, Ada"');
        // Positions use "; " internally so they stay in one quoted cell
        expect(dataRow).toContain('"LB(2); GK(1)"');
    });

    test('reports attendance percentage against games on roster', () => {
        const csv = buildSeasonStatsCsv({
            Ada: playerStats({ gamesPlayed: 3, gamesAttended: 3, gamesOnRoster: 4 })
        });

        expect(csv.split('\n')[1]).toContain('"75%"');
    });
});
