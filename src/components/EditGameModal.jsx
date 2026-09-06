import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, ExternalLink, TriangleAlert } from 'lucide-react';
import { toDateOnly } from '@/modules/schedule';
import { getPositionsForFormation } from '@/modules/formations';
import { validateLineup } from '@/modules/lineup-engine';
import { STATUSES } from '@/modules/roster-render';
import {
  editableQuarters,
  assignToSlot,
  removePlayerFromQuarters,
  recalculateGamePlayers,
  captainsPresent,
} from '@/modules/game-edit';
import { CONSTANTS } from '@/constants';

/**
 * A saved game, open for correction.
 *
 * What was planned and what happened are rarely the same match — someone does
 * not turn up, the armband changes hands, a keeper swaps out at half time — so
 * the squad and the quarters are editable here and not only the name and the
 * notes. It opens over the Season tab and stays there: reading a game used to
 * mean being moved to the Roster tab with the team's settings changed to that
 * game's, which is a lot to do to someone who wanted to look something up.
 * Putting the lineup back on the field is still available, as a button that
 * says so.
 */
export function EditGameModal({ isOpen, game, players = [], onClose, onSave, onOpenOnField }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [statuses, setStatuses] = useState({});
  const [captains, setCaptains] = useState([]);
  const [quarters, setQuarters] = useState([]);

  // The squad as it was that day. If a game only recorded players who took the field
  // (legacy saves), include any current roster players who were absent so the coach
  // can see their status and edit them.
  const squad = useMemo(() => {
    const recorded = Array.isArray(game?.players) ? game.players : [];
    const recordedNames = new Set(recorded.map((p) => p.name));
    const missing = (players || [])
      .filter((p) => !recordedNames.has(p.name))
      .map((p) => ({
        ...p,
        status: 'absent',
        quartersPlayed: [],
        quartersSitting: [],
        positionsPlayed: [],
        offensiveQuarters: 0,
        defensiveQuarters: 0,
        goalieQuarter: null,
      }));
    return [...recorded, ...missing];
  }, [game, players]);

  const positions = useMemo(() => {
    if (!game) return [];
    const fieldPlayers =
      game.fieldPlayers ||
      CONSTANTS.AGE_DIVISIONS[game.ageDivision || game.division]?.fieldSize ||
      7;
    return getPositionsForFormation(fieldPlayers, game.formation || '2-3-1');
  }, [game]);

  useEffect(() => {
    if (!game || !isOpen) return;

    setName(game.name || '');
    setDate(game.date ? toDateOnly(game.date) : '');
    setNotes(game.notes || '');
    setStatuses(
      Object.fromEntries(
        squad.map((p) => [p.name, p.status || 'available'])
      )
    );
    setCaptains(
      Array.isArray(game.captains)
        ? [...game.captains]
        : (game.players || []).filter((p) => p.isCaptain).map((p) => p.name)
    );
    setQuarters(editableQuarters(game, positions));
  }, [game, isOpen, positions]);

  const available = useMemo(
    () => squad.filter((p) => (statuses[p.name] ?? 'available') === 'available'),
    [squad, statuses]
  );

  // The record this edit would write, and what the AYSO rules make of it. The
  // warnings are shown and never enforced: a match that broke the rotation is
  // still what happened, and the record has to be able to say so.
  const recalculated = useMemo(
    () => recalculateGamePlayers(squad, quarters, { captains, statuses }),
    [squad, quarters, captains, statuses]
  );
  const warnings = useMemo(
    () => (quarters.length > 0 ? validateLineup(recalculated, quarters.length) : []),
    [recalculated, quarters.length]
  );

  if (!isOpen || !game) return null;

  const setStatus = (playerName, status) => {
    setStatuses((prev) => ({ ...prev, [playerName]: status }));

    // Someone who was not there did not play and did not wear the armband.
    if (status !== 'available') {
      setQuarters((prev) => removePlayerFromQuarters(prev, playerName));
      setCaptains((prev) => prev.filter((c) => c !== playerName));
    }
  };

  // The armband is capped, so a star that would exceed it is disabled and says
  // why — clicking it and having nothing happen reads as a broken control.
  const captainSlotsFull = (isCaptain) =>
    !isCaptain && captains.length >= CONSTANTS.MAX_CAPTAINS;

  const toggleCaptain = (playerName) => {
    setCaptains((prev) => {
      if (prev.includes(playerName)) return prev.filter((c) => c !== playerName);
      if (prev.length >= CONSTANTS.MAX_CAPTAINS) return prev;
      return [...prev, playerName];
    });
  };

  const assign = (quarterNumber, position, playerName) => {
    setQuarters((prev) => assignToSlot(prev, quarterNumber, position, playerName));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const finalCaptains = captainsPresent(captains, statuses);

    onSave(game.id, {
      name: name.trim(),
      date: date || null,
      notes: notes.trim(),
      ...(squad.length > 0
        ? {
            quarters,
            captains: finalCaptains,
            players: recalculateGamePlayers(squad, quarters, {
              captains: finalCaptains,
              statuses,
            }),
          }
        : {}),
    });
    onClose();
  };

  const restingIn = (quarter) => {
    const onField = new Set(Object.values(quarter.positions || {}).filter(Boolean));
    return available.filter((p) => !onField.has(p.name)).map((p) => p.name);
  };

  const labelFor = (player) =>
    player.number ? `#${player.number} ${player.name}` : player.name;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] flex flex-col"
        id="editGameModal"
      >
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="text-base font-semibold">Edit Game</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1 min-h-0 pr-3 py-1">
            <div className="space-y-5 py-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="editGameName" className="text-xs text-muted-foreground">
                  Game Name:
                </Label>
                <Input
                  type="text"
                  id="editGameName"
                  placeholder="e.g., vs Tigers / Game 1"
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editGameDate" className="text-xs text-muted-foreground">
                  Game Date:
                </Label>
                <Input
                  type="date"
                  id="editGameDate"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editGameNotes" className="text-xs text-muted-foreground">
                  Game Notes:
                </Label>
                <Textarea
                  id="editGameNotes"
                  rows={3}
                  maxLength={500}
                  placeholder="e.g., Won 3-1, great passing in second half..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-sm w-full"
                />
              </div>
            </div>

            {squad.length > 0 && (
              <>
                <section className="space-y-2" id="editGameSquad">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Who was there
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
                      {available.length} of {squad.length} available · captains{' '}
                      {captains.length}/{CONSTANTS.MAX_CAPTAINS}
                    </span>
                  </div>

                  <div className="border rounded-lg divide-y">
                    {squad.map((player) => {
                      const status = statuses[player.name] ?? 'available';
                      const isCaptain = captains.includes(player.name);

                      return (
                        <div
                          key={player.name}
                          className="flex items-center gap-2 px-2.5 py-1.5 text-xs game-squad-row"
                          data-player={player.name}
                        >
                          <button
                            type="button"
                            data-action="toggle-captain"
                            aria-pressed={isCaptain}
                            aria-label={`Captain: ${player.name}`}
                            disabled={status !== 'available' || captainSlotsFull(isCaptain)}
                            title={
                              captainSlotsFull(isCaptain)
                                ? `Already ${CONSTANTS.MAX_CAPTAINS} captains — unpick one first`
                                : 'Captain'
                            }
                            onClick={() => toggleCaptain(player.name)}
                            className="shrink-0 p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Star
                              className={
                                isCaptain
                                  ? 'h-4 w-4 fill-amber-400 text-amber-500'
                                  : 'h-4 w-4 text-muted-foreground'
                              }
                            />
                          </button>

                          <span className="flex-1 truncate font-medium">
                            {labelFor(player)}
                          </span>

                          <select
                            aria-label={`Status: ${player.name}`}
                            data-action="player-status"
                            value={status}
                            onChange={(e) => setStatus(player.name, e.target.value)}
                            className="h-7 rounded-md border bg-background px-1.5 text-xs"
                          >
                            {STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2" id="editGameLineup">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Who played where
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {quarters.map((quarter) => {
                      const resting = restingIn(quarter);

                      return (
                        <div
                          key={quarter.quarter}
                          className="border rounded-lg p-2.5 space-y-1.5 game-quarter-edit"
                          data-quarter={quarter.quarter}
                        >
                          <div className="text-xs font-bold">Quarter {quarter.quarter}</div>

                          {positions.map((position) => (
                            <div key={position} className="flex items-center gap-2">
                              <span className="w-24 shrink-0 text-[11px] text-muted-foreground truncate">
                                {position}
                              </span>
                              <select
                                aria-label={`Q${quarter.quarter} ${position}`}
                                data-action="assign-position"
                                value={quarter.positions[position] || ''}
                                onChange={(e) =>
                                  assign(quarter.quarter, position, e.target.value)
                                }
                                className="flex-1 h-7 min-w-0 rounded-md border bg-background px-1.5 text-xs"
                              >
                                <option value="">—</option>
                                {available.map((player) => (
                                  <option key={player.name} value={player.name}>
                                    {labelFor(player)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}

                          <div className="text-[11px] text-muted-foreground pt-0.5 quarter-resting">
                            Resting: {resting.length > 0 ? resting.join(', ') : 'nobody'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {warnings.length > 0 && (
                  <section className="space-y-1.5" id="editGameWarnings">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="h-3.5 w-3.5" />
                      Rotation notes
                    </h3>
                    <ul className="space-y-0.5">
                      {warnings.map((warning) => (
                        <li key={warning} className="text-[11px] text-muted-foreground">
                          {warning}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground italic">
                      Saved either way — this is a record of the match, not a plan for it.
                    </p>
                  </section>
                )}
              </>
            )}
            </div>
          </ScrollArea>

          <DialogFooter className="pt-3 border-t flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            {onOpenOnField ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                id="openGameOnField"
                onClick={() => {
                  onOpenOnField(game);
                  onClose();
                }}
                className="text-xs gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open on the field
              </Button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                id="cancelEditGame"
                onClick={onClose}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" id="confirmEditGame" className="text-xs">
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
