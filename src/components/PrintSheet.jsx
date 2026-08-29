import React from 'react';
import { printableQuarters } from '@/modules/print-lineup';
import { parseLocalDate } from '@/modules/schedule';

/**
 * The lineup as one sheet of paper.
 *
 * It is in the DOM at all times and hidden until the print stylesheet reveals
 * it (see `.print-sheet` in index.css), so Ctrl-P prints the same page as the
 * Print button, and nothing has to be rendered into a popup the browser may
 * block.
 */
export function PrintSheet({
  lineup,
  players = [],
  captains = [],
  teamName = 'Our Team',
  ageDivision = '10U',
  date,
}) {
  const quarters = printableQuarters(lineup, players, captains);

  const printedOn = parseLocalDate(date || undefined).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    // aria-hidden: the same lineup is already on screen in the quarter cards,
    // and a second copy is only noise to a screen reader.
    <div className="print-sheet" id="printSheet" aria-hidden="true">
      <div className="print-sheet-header">
        <div className="print-team">{teamName}</div>
        <span>
          {ageDivision} · {lineup?.formation || '2-3-1'} · {printedOn}
        </span>
      </div>

      {quarters.length === 0 && (
        // Ctrl-P before a lineup exists: the app itself is hidden by the print
        // stylesheet, so say why the page is nearly empty rather than printing
        // a blank sheet.
        <p className="print-empty">No lineup has been generated yet.</p>
      )}

      <div className="print-quarters">
        {quarters.map((quarter) => (
          <section className="print-quarter" key={quarter.quarter}>
            <div className="print-quarter-title">
              Quarter {quarter.quarter}
              <span className="print-on-field">{quarter.rows.length} on field</span>
            </div>

            <table>
              <tbody>
                {quarter.rows.map((row) => (
                  <tr key={row.position} className={row.position === 'Keeper' ? 'print-keeper' : undefined}>
                    <td className="print-position">{row.position}</td>
                    <td className="print-number">{row.number != null ? `#${row.number}` : ''}</td>
                    <td className="print-player">
                      {row.name}
                      {row.isCaptain && <span className="print-captain"> (C)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {quarter.sitting.length > 0 && (
              <p className="print-sitting">
                <strong>Sitting:</strong>{' '}
                {quarter.sitting
                  .map((sit) => (sit.number != null ? `#${sit.number} ${sit.name}` : sit.name))
                  .join(', ')}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
