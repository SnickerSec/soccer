// Tests for formation functions
import {
    FORMATIONS,
    getPositionsForFormation,
    getFormationsForFieldSize,
    isDefensivePosition,
    isOffensivePosition,
    getFormationDescription
} from '../public/modules/formations.js';

describe('FORMATIONS structure', () => {
    test('should have 11v11 formations', () => {
        expect(FORMATIONS[11]).toBeDefined();
        expect(Object.keys(FORMATIONS[11]).length).toBeGreaterThan(0);
    });

    test('should have 9v9 formations', () => {
        expect(FORMATIONS[9]).toBeDefined();
        expect(Object.keys(FORMATIONS[9]).length).toBeGreaterThan(0);
    });

    test('should have 7v7 formations', () => {
        expect(FORMATIONS[7]).toBeDefined();
        expect(Object.keys(FORMATIONS[7]).length).toBeGreaterThan(0);
    });

    test('should have 6v6 formations', () => {
        expect(FORMATIONS[6]).toBeDefined();
        expect(Object.keys(FORMATIONS[6]).length).toBeGreaterThan(0);
    });

    test('should have 5v5 formations', () => {
        expect(FORMATIONS[5]).toBeDefined();
        expect(Object.keys(FORMATIONS[5]).length).toBeGreaterThan(0);
    });
});

describe('getPositionsForFormation', () => {
    test('7v7 2-3-1 should return 7 positions', () => {
        const positions = getPositionsForFormation(7, '2-3-1');
        expect(positions).toHaveLength(7);
    });

    test('7v7 2-3-1 should include Keeper', () => {
        const positions = getPositionsForFormation(7, '2-3-1');
        expect(positions).toContain('Keeper');
    });

    test('11v11 4-4-2 should return 11 positions', () => {
        const positions = getPositionsForFormation(11, '4-4-2');
        expect(positions).toHaveLength(11);
    });

    test('9v9 3-3-2 should return 9 positions', () => {
        const positions = getPositionsForFormation(9, '3-3-2');
        expect(positions).toHaveLength(9);
    });

    test('5v5 should return 5 positions', () => {
        const positions = getPositionsForFormation(5, '2-2');
        expect(positions).toHaveLength(5);
    });

    test('unknown field size should fallback to 7v7', () => {
        const positions = getPositionsForFormation(99, 'unknown');
        expect(positions).toHaveLength(7);
    });

    test('unknown formation should use default for field size', () => {
        const positions = getPositionsForFormation(11, 'unknown');
        expect(positions).toHaveLength(11);
    });
});

describe('getFormationsForFieldSize', () => {
    test('7v7 should have multiple formations', () => {
        const formations = getFormationsForFieldSize(7);
        expect(formations.length).toBeGreaterThan(1);
    });

    test('7v7 formations should include 2-3-1', () => {
        const formations = getFormationsForFieldSize(7);
        expect(formations).toContain('2-3-1');
    });

    test('11v11 formations should include 4-4-2', () => {
        const formations = getFormationsForFieldSize(11);
        expect(formations).toContain('4-4-2');
    });

    test('should not include "default" in formations list', () => {
        const formations = getFormationsForFieldSize(7);
        expect(formations).not.toContain('default');
    });

    test('unknown field size should return empty array', () => {
        const formations = getFormationsForFieldSize(99);
        expect(formations).toEqual([]);
    });
});

describe('isDefensivePosition', () => {
    test('Keeper should be defensive', () => {
        expect(isDefensivePosition('Keeper')).toBe(true);
    });

    test('Left Back should be defensive', () => {
        expect(isDefensivePosition('Left Back')).toBe(true);
    });

    test('Center Back should be defensive', () => {
        expect(isDefensivePosition('Center Back')).toBe(true);
    });

    test('Right Center Back should be defensive', () => {
        expect(isDefensivePosition('Right Center Back')).toBe(true);
    });

    test('Striker should not be defensive', () => {
        expect(isDefensivePosition('Striker')).toBe(false);
    });

    test('Left Wing should not be defensive', () => {
        expect(isDefensivePosition('Left Wing')).toBe(false);
    });

    test('Center Mid should not be defensive', () => {
        expect(isDefensivePosition('Center Mid')).toBe(false);
    });
});

describe('isOffensivePosition', () => {
    test('Striker should be offensive', () => {
        expect(isOffensivePosition('Striker')).toBe(true);
    });

    test('Left Wing should be offensive', () => {
        expect(isOffensivePosition('Left Wing')).toBe(true);
    });

    test('Center Mid should be offensive', () => {
        expect(isOffensivePosition('Center Mid')).toBe(true);
    });

    test('Keeper should not be offensive', () => {
        expect(isOffensivePosition('Keeper')).toBe(false);
    });

    test('Left Back should not be offensive', () => {
        expect(isOffensivePosition('Left Back')).toBe(false);
    });
});

describe('getFormationDescription', () => {
    test('4-4-2 should have a description', () => {
        const desc = getFormationDescription(11, '4-4-2');
        expect(desc.length).toBeGreaterThan(0);
    });

    test('2-3-1 should have a description', () => {
        const desc = getFormationDescription(7, '2-3-1');
        expect(desc.length).toBeGreaterThan(0);
    });

    test('unknown formation should return empty string', () => {
        const desc = getFormationDescription(7, 'unknown');
        expect(desc).toBe('');
    });
});
