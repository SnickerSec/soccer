// Tests for formation functions
import {
    FORMATIONS,
    getPositionsForFormation,
    getFormationsForFieldSize,
    isDefensivePosition,
    isOffensivePosition,
    getFormationDescription,
    getCustomFormations,
    saveCustomFormation,
    deleteCustomFormation
} from '../src/modules/formations.js';

/**
 * Custom formations live in localStorage, which Node has not got. Every
 * formation lookup consults them, so without this the module's own safe-storage
 * fallback fires on each call and the suite tests only the built-ins.
 */
const store = new Map();
globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => store.clear()
};

beforeEach(() => store.clear());

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

    test('7v7 3-3 should return 3 backs and 3 forwards with no midfielders', () => {
        const positions = getPositionsForFormation(7, '3-3');
        expect(positions).toHaveLength(7);
        expect(positions).toContain('Keeper');
        expect(positions).toEqual(['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Forward', 'Striker', 'Right Forward']);

        const defPositions = positions.filter(p => isDefensivePosition(p));
        const midPositions = positions.filter(p => p.includes('Mid') || p === 'Midfield');
        const offPositions = positions.filter(p => isOffensivePosition(p));

        expect(defPositions).toHaveLength(4); // Keeper + 3 Backs
        expect(midPositions).toHaveLength(0); // No midfielders
        expect(offPositions).toHaveLength(3); // 3 Forwards (Left Forward, Striker, Right Forward)
    });

    test('6v6 3-3 should return 3 backs and 2 forwards with no midfielders', () => {
        const positions = getPositionsForFormation(6, '3-3');
        expect(positions).toHaveLength(6);
        expect(positions).toContain('Keeper');
        expect(positions).toEqual(['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Forward', 'Right Forward']);
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

/**
 * The invariant that matters, checked for every formation rather than the
 * handful spelled out above.
 *
 * A 6v6 '3-3' returning the 7v7 array is exactly the drift that shipped: the
 * generator filled six positions while the UI rendered seven, so every quarter
 * of every 6v6 lineup carried a "Right Mid — TBD" nobody could ever fill.
 */
describe('every formation fields exactly its field size', () => {
    const fieldSizes = Object.keys(FORMATIONS).map(Number);

    test.each(fieldSizes)('%iv%i', (size) => {
        for (const formation of getFormationsForFieldSize(size)) {
            const positions = getPositionsForFormation(size, formation);
            expect(`${formation}: ${positions.length}`).toBe(`${formation}: ${size}`);
        }
    });

    test.each(fieldSizes)('%iv%i has exactly one keeper', (size) => {
        for (const formation of getFormationsForFieldSize(size)) {
            const keepers = getPositionsForFormation(size, formation)
                .filter(position => position === 'Keeper');
            expect(`${formation}: ${keepers.length}`).toBe(`${formation}: 1`);
        }
    });

    test.each(fieldSizes)('%iv%i names no position twice', (size) => {
        for (const formation of getFormationsForFieldSize(size)) {
            const positions = getPositionsForFormation(size, formation);
            // A duplicate name means two players share a slot key, and the
            // lineup is keyed by position
            expect(`${formation}: ${new Set(positions).size}`)
                .toBe(`${formation}: ${positions.length}`);
        }
    });

    test.each(fieldSizes)('%iv%i default formation exists', (size) => {
        const { default: name } = FORMATIONS[size];
        expect(getFormationsForFieldSize(size)).toContain(name);
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

    /**
     * Not the empty string: GameSettings renders this straight into the panel,
     * and its sibling getAgeRules() answers an unknown division the same way
     * rather than leaving a blank line under the dropdown.
     */
    test('an unknown formation falls back to a generic description', () => {
        const desc = getFormationDescription(7, 'unknown');
        expect(desc).toBe('Tactical player distribution across the field');
    });
});

/**
 * The Tactical Formation Builder writes these. They are consulted by every
 * lookup in this module, ahead of the built-ins, so a custom formation has to
 * behave like a first-class one everywhere rather than only in the picker.
 */
describe('custom formations', () => {
    const diamond = () => ({
        name: 'Diamond',
        fieldSize: 7,
        positions: ['Keeper', 'Center Back', 'Left Mid', 'Right Mid', 'Center Mid', 'Striker', 'Support']
    });

    test('a saved formation reads back', () => {
        const saved = saveCustomFormation(diamond());

        expect(saved.name).toBe('Diamond');
        expect(saved.fieldSize).toBe(7);
        expect(getCustomFormations()).toEqual([saved]);
    });

    test('starts empty, and survives nothing being stored yet', () => {
        expect(getCustomFormations()).toEqual([]);
    });

    /** A <select> hands back strings, so the field size is coerced on the way in. */
    test('a field size given as a string is stored as a number', () => {
        const saved = saveCustomFormation({ ...diamond(), fieldSize: '7' });

        expect(saved.fieldSize).toBe(7);
        expect(getFormationsForFieldSize(7)).toContain('Diamond');
    });

    test('saving the same name and size again replaces rather than duplicates', () => {
        saveCustomFormation(diamond());
        saveCustomFormation({ ...diamond(), positions: ['Keeper', 'Sweeper'] });

        const all = getCustomFormations();
        expect(all).toHaveLength(1);
        expect(all[0].positions).toEqual(['Keeper', 'Sweeper']);
    });

    test('the same name at a different field size is a different formation', () => {
        saveCustomFormation(diamond());
        saveCustomFormation({ ...diamond(), fieldSize: 9 });

        expect(getCustomFormations()).toHaveLength(2);
        expect(getFormationsForFieldSize(7)).toContain('Diamond');
        expect(getFormationsForFieldSize(9)).toContain('Diamond');
    });

    test('appears in the picker for its own field size only', () => {
        saveCustomFormation(diamond());

        expect(getFormationsForFieldSize(7)).toContain('Diamond');
        expect(getFormationsForFieldSize(11)).not.toContain('Diamond');
    });

    test('is listed alongside the built-ins, without displacing them', () => {
        const builtIn = getFormationsForFieldSize(7);
        saveCustomFormation(diamond());

        const withCustom = getFormationsForFieldSize(7);
        expect(withCustom).toEqual(expect.arrayContaining(builtIn));
        expect(withCustom).toHaveLength(builtIn.length + 1);
    });

    test('a custom name matching a built-in is listed once', () => {
        const existing = getFormationsForFieldSize(7)[0];
        saveCustomFormation({ ...diamond(), name: existing });

        const names = getFormationsForFieldSize(7);
        expect(names.filter(n => n === existing)).toHaveLength(1);
    });

    test('its positions are what the lineup is built from', () => {
        const custom = diamond();
        saveCustomFormation(custom);

        expect(getPositionsForFormation(7, 'Diamond')).toEqual(custom.positions);
    });

    test('a custom formation wins over a built-in of the same name', () => {
        const existing = getFormationsForFieldSize(7)[0];
        saveCustomFormation({ ...diamond(), name: existing });

        expect(getPositionsForFormation(7, existing)).toEqual(diamond().positions);
    });

    test('describes itself, and writes its own description when given none', () => {
        saveCustomFormation(diamond());
        expect(getFormationDescription(7, 'Diamond')).toBe('Custom Diamond formation (7v7)');

        saveCustomFormation({ ...diamond(), name: 'Wide', description: 'Stretches the pitch' });
        expect(getFormationDescription(7, 'Wide')).toBe('Stretches the pitch');
    });

    test('deleting takes out that one and leaves the rest', () => {
        saveCustomFormation(diamond());
        saveCustomFormation({ ...diamond(), name: 'Wide' });

        deleteCustomFormation('Diamond', 7);

        expect(getCustomFormations().map(f => f.name)).toEqual(['Wide']);
        expect(getFormationsForFieldSize(7)).not.toContain('Diamond');
    });

    test('deleting matches on field size too', () => {
        saveCustomFormation(diamond());
        deleteCustomFormation('Diamond', 9);

        expect(getCustomFormations().map(f => f.name)).toEqual(['Diamond']);
    });

    /** An empty positions list must not be handed to the lineup engine. */
    test('a formation saved with no positions does not override the built-in', () => {
        const existing = getFormationsForFieldSize(7)[0];
        const builtInPositions = getPositionsForFormation(7, existing);
        saveCustomFormation({ name: existing, fieldSize: 7, positions: [] });

        expect(getPositionsForFormation(7, existing)).toEqual(builtInPositions);
    });
});
