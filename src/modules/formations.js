// Soccer formation definitions and position mappings

export const FORMATIONS = {
    // 11v11 formations (14U-19U)
    11: {
        '4-3-3': ['Keeper', 'Left Back', 'Left Center Back', 'Right Center Back', 'Right Back',
                  'Left Mid', 'Center Mid', 'Right Mid',
                  'Left Wing', 'Striker', 'Right Wing'],
        '4-4-2': ['Keeper', 'Left Back', 'Left Center Back', 'Right Center Back', 'Right Back',
                  'Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid',
                  'Left Striker', 'Right Striker'],
        '4-2-3-1': ['Keeper', 'Left Back', 'Left Center Back', 'Right Center Back', 'Right Back',
                    'Left Defensive Mid', 'Right Defensive Mid',
                    'Left Wing', 'Attacking Mid', 'Right Wing',
                    'Striker'],
        '3-5-2': ['Keeper', 'Left Center Back', 'Center Back', 'Right Center Back',
                  'Left Wing Back', 'Left Mid', 'Center Mid', 'Right Mid', 'Right Wing Back',
                  'Left Striker', 'Right Striker'],
        '5-3-2': ['Keeper', 'Left Wing Back', 'Left Center Back', 'Center Back', 'Right Center Back', 'Right Wing Back',
                  'Left Mid', 'Center Mid', 'Right Mid',
                  'Left Striker', 'Right Striker'],
        default: '4-4-2'
    },

    // 9v9 formations (12U)
    9: {
        '3-3-2': ['Keeper', 'Left Back', 'Center Back', 'Right Back',
                  'Left Mid', 'Center Mid', 'Right Mid',
                  'Left Forward', 'Right Forward'],
        '3-2-3': ['Keeper', 'Left Back', 'Center Back', 'Right Back',
                  'Left Mid', 'Right Mid',
                  'Left Wing', 'Striker', 'Right Wing'],
        '2-3-3': ['Keeper', 'Left Back', 'Right Back',
                  'Left Mid', 'Center Mid', 'Right Mid',
                  'Left Wing', 'Striker', 'Right Wing'],
        default: '3-3-2'
    },

    // 7v7 formations (10U)
    7: {
        '2-3-1': ['Keeper', 'Left Back', 'Right Back', 'Left Wing', 'Right Wing', 'Center Mid', 'Striker'],
        '3-2-1': ['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Mid', 'Right Mid', 'Striker'],
        '2-2-2': ['Keeper', 'Left Back', 'Right Back', 'Left Mid', 'Right Mid', 'Left Striker', 'Right Striker'],
        '3-3': ['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Forward', 'Striker', 'Right Forward'],
        default: '2-3-1'
    },

    // 6v6 formations (small-sided)
    6: {
        '2-3-1': ['Keeper', 'Left Back', 'Right Back', 'Left Mid', 'Right Mid', 'Striker'],
        '3-2-1': ['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Mid', 'Striker'],
        '2-2-2': ['Keeper', 'Left Back', 'Right Back', 'Left Mid', 'Right Mid', 'Striker'],
        '3-3': ['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Forward', 'Right Forward'],
        default: '2-3-1'
    },

    // 5v5 formations (U8 and younger)
    5: {
        '2-2': ['Keeper', 'Left Back', 'Right Back', 'Midfield', 'Striker'],
        default: '2-2'
    }
};

import { CONSTANTS } from '../constants.js';
import { safeGetFromStorage, safeSetToStorage, safeParseJSON } from './storage.js';

export function getCustomFormations() {
    return safeParseJSON(safeGetFromStorage(CONSTANTS.STORAGE_KEYS.CUSTOM_FORMATIONS), []);
}

export function saveCustomFormation({ name, fieldSize, positions, description = '' }) {
    const list = getCustomFormations().filter(
        f => !(f.name === name && Number(f.fieldSize) === Number(fieldSize))
    );
    const newForm = {
        name,
        fieldSize: Number(fieldSize),
        positions: Array.isArray(positions) ? positions : [],
        description: description || `Custom ${name} formation (${fieldSize}v${fieldSize})`,
    };
    list.push(newForm);
    safeSetToStorage(CONSTANTS.STORAGE_KEYS.CUSTOM_FORMATIONS, JSON.stringify(list));
    return newForm;
}

export function deleteCustomFormation(name, fieldSize) {
    const list = getCustomFormations().filter(
        f => !(f.name === name && Number(f.fieldSize) === Number(fieldSize))
    );
    safeSetToStorage(CONSTANTS.STORAGE_KEYS.CUSTOM_FORMATIONS, JSON.stringify(list));
    return true;
}

/**
 * Get positions for a given formation and field size
 */
export function getPositionsForFormation(playersOnField, formation) {
    // Check custom formations first
    const customList = getCustomFormations();
    const customMatch = customList.find(
        f => f.name === formation && Number(f.fieldSize) === Number(playersOnField)
    );
    if (customMatch && customMatch.positions?.length > 0) {
        return customMatch.positions;
    }

    const fieldFormations = FORMATIONS[playersOnField];

    if (!fieldFormations) {
        // Fallback to 7v7
        return FORMATIONS[7]['2-3-1'];
    }

    return fieldFormations[formation] || fieldFormations[fieldFormations.default];
}

/**
 * Get available formations for a field size
 */
export function getFormationsForFieldSize(playersOnField) {
    const fieldFormations = FORMATIONS[playersOnField];
    const builtIn = fieldFormations
        ? Object.keys(fieldFormations).filter(key => key !== 'default')
        : [];

    const customList = getCustomFormations()
        .filter(f => Number(f.fieldSize) === Number(playersOnField))
        .map(f => f.name);

    return Array.from(new Set([...builtIn, ...customList]));
}

/**
 * Whether a formation fields a midfield line at all.
 *
 * Read off the formation's own positions rather than a list of names, so it
 * stays right as formations are added: 3-3 is three backs and three forwards
 * with nothing between them, and a Season tab that labels that "Defense /
 * Midfield / Offense" is describing a shape the team does not play.
 *
 * An unknown or custom formation is assumed to have one — the caller then
 * keeps the midfield column, which shows real quarters rather than hiding them.
 */
export function formationHasMidfieldLine(formation) {
    if (!formation) return true;

    for (const bySize of Object.values(FORMATIONS)) {
        const positions = bySize[formation];
        if (Array.isArray(positions)) {
            return positions.some((p) => p.includes('Mid') || p === 'Midfield');
        }
    }

    return true;
}

/**
 * Check if position is defensive
 */
export function isDefensivePosition(position) {
    return position.includes('Back') || position === 'Keeper';
}

/**
 * Check if position is offensive
 */
export function isOffensivePosition(position) {
    return !isDefensivePosition(position);
}

/**
 * Get formation description
 */
export function getFormationDescription(playersOnField, formation) {
    const targetFormation = formation !== undefined ? formation : playersOnField;

    // Check custom formations description
    const customList = getCustomFormations();
    const customMatch = customList.find(
        f => f.name === targetFormation && (!playersOnField || Number(f.fieldSize) === Number(playersOnField))
    );
    if (customMatch && customMatch.description) {
        return customMatch.description;
    }

    const descriptions = {
        // 6v6 & 7v7
        '2-3-1': 'Balanced attack with wing play',
        '3-2-1': 'Defensive with counter-attack focus',
        '2-2-2': 'Two striker formation for aggressive play',
        '3-3': 'Direct play with 3 defenders and 3 forwards (no midfield)',
        // 5v5
        '2-2': 'Small-sided formation with 2 defenders and attacking players',
        // 9v9
        '3-3-2': 'Balanced with two forwards',
        '3-2-3': 'Wide attacking play with wingers',
        '2-3-3': 'Attacking formation with strong midfield',
        // 11v11
        '4-3-3': 'Wide attacking with wingers',
        '4-4-2': 'Classic balanced formation',
        '4-2-3-1': 'Defensive midfield anchor with attacking mid',
        '3-5-2': 'Midfield control with wing backs',
        '5-3-2': 'Defensive with wing backs pushing up'
    };

    return descriptions[targetFormation] || 'Tactical player distribution across the field';
}
