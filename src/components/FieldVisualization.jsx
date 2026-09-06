import React from 'react';
import { getPlayerInitials } from '@/modules/field-visualization';

const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 600;

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
  'Attacking Mid': { x: 50, y: 35 },
};

/*
 * The pitch palette lives in src/index.css as --pitch-* tokens, in pairs: every
 * marker fill has a foreground chosen to stay readable on it. The text used to
 * be a hardcoded white, which on the keeper's yellow measures 1.51:1 — the
 * shirt number a coach most needs to read was the one they could not.
 *
 * These are `style` rather than `fill=` attributes on purpose: var() does not
 * resolve inside an SVG presentation attribute, only through CSS.
 */
const MARKER_ROLES = {
  keeper: {
    fill: 'hsl(var(--pitch-keeper))',
    text: 'hsl(var(--pitch-keeper-foreground))',
  },
  defensive: {
    fill: 'hsl(var(--pitch-defense))',
    text: 'hsl(var(--pitch-defense-foreground))',
  },
  offensive: {
    fill: 'hsl(var(--pitch-offense))',
    text: 'hsl(var(--pitch-offense-foreground))',
  },
};

const LEGEND_ITEMS = [
  { className: 'keeper', label: 'Keeper', role: 'keeper' },
  { className: 'defensive', label: 'Defense', role: 'defensive' },
  { className: 'offensive', label: 'Offense', role: 'offensive' },
];

function markerRole(position) {
  if (position === 'Keeper') return 'keeper';
  if (position.includes('Back')) return 'defensive';
  return 'offensive';
}

export function FieldVisualization({
  quarterNumber,
  positions = {},
  players = [],
}) {
  const positionEntries = Object.entries(positions).filter(
    ([pos, name]) => name && POSITION_COORDS[pos]
  );

  return (
    <div
      className="field-container mt-3 border rounded-lg bg-card p-2 flex flex-col items-center"
      role="img"
      aria-label={`Soccer field visualization showing player positions for Quarter ${quarterNumber}`}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="soccer-field w-full max-w-[280px] h-auto rounded shadow-inner"
      >
        {/* Pitch surface */}
        <rect x="0" y="0" width="400" height="600" className="pitch-grass" />
        <rect x="20" y="20" width="360" height="560" fill="none" strokeWidth="3" />
        <line x1="20" y1="300" x2="380" y2="300" strokeWidth="3" />
        <circle cx="200" cy="300" r="60" fill="none" strokeWidth="3" />
        <circle cx="200" cy="300" r="5" />

        {/* Penalty areas */}
        <rect x="100" y="20" width="200" height="100" fill="none" strokeWidth="3" />
        <rect x="100" y="480" width="200" height="100" fill="none" strokeWidth="3" />

        {/* Goal areas */}
        <rect x="140" y="20" width="120" height="40" fill="none" strokeWidth="3" />
        <rect x="140" y="540" width="120" height="40" fill="none" strokeWidth="3" />

        {/* Goals */}
        <rect x="170" y="10" width="60" height="10" />
        <rect x="170" y="580" width="60" height="10" />

        {/* Penalty spots */}
        <circle cx="200" cy="80" r="3" />
        <circle cx="200" cy="520" r="3" />

        {/* Player markers */}
        {positionEntries.map(([position, playerVal]) => {
          const playerName = typeof playerVal === 'string' ? playerVal : (playerVal?.name || '');
          const coord = POSITION_COORDS[position];
          const x = coord.x * (VIEWBOX_WIDTH / 100);
          const y = coord.y * (VIEWBOX_HEIGHT / 100);

          const playerInfo = players.find((p) => p.name === playerName);
          const hasNumber = Boolean(playerInfo && playerInfo.number);
          const displayText = hasNumber ? String(playerInfo.number) : getPlayerInitials(playerName);

          const role = markerRole(position);

          return (
            <g key={position} className="player-marker cursor-pointer">
              <circle
                cx={x}
                cy={y}
                r="18"
                style={{ fill: MARKER_ROLES[role].fill }}
                strokeWidth="2"
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fill: MARKER_ROLES[role].text }}
                fontSize={hasNumber ? '12' : '10'}
                fontWeight="bold"
              >
                {displayText}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="field-legend flex items-center justify-center gap-3 mt-2 text-[11px] text-muted-foreground">
        {LEGEND_ITEMS.map((item) => (
          <span key={item.label} className="legend-item flex items-center gap-1">
            <span
              className={`legend-color ${item.className} inline-block w-2.5 h-2.5 rounded-full`}
              style={{ backgroundColor: MARKER_ROLES[item.role].fill }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
