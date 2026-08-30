/**
 * Builds the SVG pitch diagram shown for each quarter.
 *
 * Returns a detached element; the caller decides where it goes.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// The diagram's coordinate space. Position coordinates below are percentages,
// scaled onto this box.
const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 600;

/** Where each named position sits on the pitch, as percentages of the box. */
const POSITION_COORDS = {
    'Keeper': { x: 50, y: 90 },
    'Left Back': { x: 25, y: 70 },
    'Right Back': { x: 75, y: 70 },
    'Left Wing': { x: 15, y: 40 },
    'Right Wing': { x: 85, y: 40 },
    'Center Mid': { x: 50, y: 45 },
    'Striker': { x: 50, y: 20 },
    'Center Back': { x: 50, y: 72 },
    'Left Mid': { x: 30, y: 45 },
    'Right Mid': { x: 70, y: 45 },
    'Left Striker': { x: 35, y: 20 },
    'Right Striker': { x: 65, y: 20 },
    'Left Forward': { x: 28, y: 22 },
    'Right Forward': { x: 72, y: 22 },
    'Center Forward': { x: 50, y: 20 },
    'Left Center Back': { x: 35, y: 75 },
    'Right Center Back': { x: 65, y: 75 },
    'Left Wing Back': { x: 15, y: 55 },
    'Right Wing Back': { x: 85, y: 55 },
    'Left Center Mid': { x: 35, y: 50 },
    'Right Center Mid': { x: 65, y: 50 },
    'Left Defensive Mid': { x: 40, y: 60 },
    'Right Defensive Mid': { x: 60, y: 60 },
    'Attacking Mid': { x: 50, y: 35 }
};

const MARKER_COLORS = {
    keeper: '#ffcc00',
    defensive: '#3498db',
    offensive: '#e74c3c'
};

/** The pitch markings, drawn before any players. */
const FIELD_SHAPES = [
    ['rect', { x: 0, y: 0, width: 400, height: 600, fill: '#4a9b4a' }],
    ['rect', { x: 20, y: 20, width: 360, height: 560, fill: 'none', stroke: 'white', 'stroke-width': 3 }],
    ['line', { x1: 20, y1: 300, x2: 380, y2: 300, stroke: 'white', 'stroke-width': 3 }],
    ['circle', { cx: 200, cy: 300, r: 60, fill: 'none', stroke: 'white', 'stroke-width': 3 }],
    ['circle', { cx: 200, cy: 300, r: 5, fill: 'white' }],
    // Penalty areas
    ['rect', { x: 100, y: 20, width: 200, height: 100, fill: 'none', stroke: 'white', 'stroke-width': 3 }],
    ['rect', { x: 100, y: 480, width: 200, height: 100, fill: 'none', stroke: 'white', 'stroke-width': 3 }],
    // Goal areas
    ['rect', { x: 140, y: 20, width: 120, height: 40, fill: 'none', stroke: 'white', 'stroke-width': 3 }],
    ['rect', { x: 140, y: 540, width: 120, height: 40, fill: 'none', stroke: 'white', 'stroke-width': 3 }],
    // Goals
    ['rect', { x: 170, y: 10, width: 60, height: 10, fill: 'white' }],
    ['rect', { x: 170, y: 580, width: 60, height: 10, fill: 'white' }],
    // Penalty spots
    ['circle', { cx: 200, cy: 80, r: 3, fill: 'white' }],
    ['circle', { cx: 200, cy: 520, r: 3, fill: 'white' }]
];

const LEGEND_ITEMS = [
    { className: 'keeper', label: 'Keeper' },
    { className: 'defensive', label: 'Defense' },
    { className: 'offensive', label: 'Offense' }
];

function createSvgElement(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
}

/**
 * A player's initials: first and last initial, or the first two characters of a
 * single-word name.
 */
export function getPlayerInitials(name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return parts[0][0] + parts[parts.length - 1][0];
    }
    return name.substring(0, 2).toUpperCase();
}

/** Keeper and any defender sit at the back; everyone else is treated as attacking. */
function markerColor(position) {
    if (position === 'Keeper') return MARKER_COLORS.keeper;
    if (position.includes('Back')) return MARKER_COLORS.defensive;
    return MARKER_COLORS.offensive;
}

/** A numbered or initialled marker for one player. */
function createPlayerMarker(position, playerName, players) {
    const coord = POSITION_COORDS[position];
    const x = coord.x * (VIEWBOX_WIDTH / 100);
    const y = coord.y * (VIEWBOX_HEIGHT / 100);

    const playerInfo = players.find(p => p.name === playerName);
    const hasNumber = Boolean(playerInfo && playerInfo.number);
    const displayText = hasNumber ? playerInfo.number : getPlayerInitials(playerName);

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'player-marker');

    group.appendChild(createSvgElement('circle', {
        cx: x, cy: y, r: 18,
        fill: markerColor(position),
        stroke: 'white', 'stroke-width': 2
    }));

    const text = createSvgElement('text', {
        x, y,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: 'white',
        'font-size': hasNumber ? '12' : '10',
        'font-weight': 'bold'
    });
    text.textContent = String(displayText);
    group.appendChild(text);

    return group;
}

function createLegend() {
    const legend = document.createElement('div');
    legend.className = 'field-legend';

    LEGEND_ITEMS.forEach(item => {
        const span = document.createElement('span');
        span.className = 'legend-item';

        const colorSpan = document.createElement('span');
        colorSpan.className = `legend-color ${item.className}`;

        span.appendChild(colorSpan);
        span.appendChild(document.createTextNode(item.label));
        legend.appendChild(span);
    });

    return legend;
}

/**
 * Builds the pitch diagram for one quarter.
 *
 * @param quarter        the quarter, with `quarter` number and `positions` map
 * @param positionOrder  position names to draw, in order
 * @param players        roster, used to prefer shirt numbers over initials
 */
export function createFieldVisualization(quarter, positionOrder, players) {
    const container = document.createElement('div');
    container.className = 'field-container';
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', `Soccer field visualization showing player positions for Quarter ${quarter.quarter}`);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`);
    svg.setAttribute('class', 'soccer-field');

    FIELD_SHAPES.forEach(([tag, attrs]) => svg.appendChild(createSvgElement(tag, attrs)));

    positionOrder.forEach(position => {
        const playerName = quarter.positions[position];
        if (playerName && POSITION_COORDS[position]) {
            svg.appendChild(createPlayerMarker(position, playerName, players));
        }
    });

    container.appendChild(svg);
    container.appendChild(createLegend());

    return container;
}
