import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Copy,
  Share2,
  FileSpreadsheet,
  FileText,
  Printer,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  LayoutGrid,
  MapPin,
  Layers,
  Star,
  Play,
  FileDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { FieldVisualization } from './FieldVisualization';
import { getPositionsForFormation } from '@/modules/formations';
import { SUMMARY_HEADERS, summaryCells } from '@/modules/player-summary';
import { cn } from '@/lib/utils';

let activeDragSlot = null;

export function LineupSection({
  lineup,
  captains = [],
  onCopyLineup,
  onShareLineup,
  onExportCSV,
  onExportText,
  onPrintLineup,
  onSaveGame,
  onSwapPositions,
  onRegenerate,
  onToggleMustRest,
  onToggleNoKeeper,
  onOpenMatchday,
  onExportPdf,
}) {
  const [viewMode, setViewMode] = useState('all'); // 'all', 'table', 'pitch'
  const [pendingSwap, setPendingSwap] = useState(null); // { quarter, position, player }
  const pendingSwapRef = useRef(null);

  useEffect(() => {
    pendingSwapRef.current = null;
    setPendingSwap(null);
  }, [lineup]);

  if (!lineup || !lineup.quarters || lineup.quarters.length === 0) {
    return (
      <section id="lineupDisplay" className="lineup-section hidden">
        <button
          type="button"
          id="saveGame"
          data-action="saveGame"
          onClick={onSaveGame}
          className="hidden"
        >
          Save Game
        </button>
      </section>
    );
  }

  const { quarters, warnings = [], playerStats = [] } = lineup;
  const isCompliant = warnings.length === 0;
  const canonicalPositions = getPositionsForFormation(
    lineup.fieldPlayers || 7,
    lineup.formation || '2-3-1'
  );

  const describeSlot = (slot) => {
    if (!slot) return '';
    const resting = String(slot.position).startsWith('Sitting:');
    const where = resting ? 'resting' : slot.position;
    return `${slot.player}, ${where}, quarter ${slot.quarter}`;
  };

  const getHintText = () => {
    if (pendingSwap) {
      return `${describeSlot(pendingSwap)} selected. Choose who to swap with, or press Escape to cancel.`;
    }
    return 'Drag a player onto another to swap them, or select two players in turn.';
  };

  const handleToggleSwap = (quarter, position, player) => {
    const prev = pendingSwapRef.current;
    if (!prev) {
      const next = { quarter: Number(quarter), position, player };
      pendingSwapRef.current = next;
      setPendingSwap(next);
      return;
    }

    if (Number(prev.quarter) === Number(quarter) && prev.position === position) {
      // Deselect
      pendingSwapRef.current = null;
      setPendingSwap(null);
      return;
    }

    // Complete swap
    const from = { ...prev };
    pendingSwapRef.current = null;
    setPendingSwap(null);
    if (onSwapPositions) {
      onSwapPositions(from.quarter, from.position, quarter, position);
    }
  };

  return (
    <section id="lineupDisplay" className="lineup-section space-y-6 pt-2">
      {/* Header & View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-3">
        <h2 className="text-xl font-bold tracking-tight">Game Lineup</h2>
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border">
          <Button
            type="button"
            variant={viewMode === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('all')}
            className="text-xs h-7 px-2.5 flex items-center gap-1.5 cursor-pointer"
          >
            <Layers className="h-3.5 w-3.5" />
            Combined
          </Button>
          <Button
            type="button"
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
            className="text-xs h-7 px-2.5 flex items-center gap-1.5 cursor-pointer"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Table Only
          </Button>
          <Button
            type="button"
            variant={viewMode === 'pitch' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('pitch')}
            className="text-xs h-7 px-2.5 flex items-center gap-1.5 cursor-pointer"
          >
            <MapPin className="h-3.5 w-3.5" />
            Pitch Only
          </Button>
        </div>
      </div>

      {/* Validation Messages */}
      <div id="validationMessages" role="status" aria-live="polite">
        {isCompliant ? (
          <Alert variant="success" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <AlertTitle className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
              AYSO Everyone Plays Compliant
            </AlertTitle>
            <AlertDescription className="text-xs text-emerald-800 dark:text-emerald-200 mt-1 leading-relaxed">
              All active players play at least 50% of the game. Goalkeepers and sit rotations meet all fair play guidelines.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="warning" className="border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-sm font-semibold text-amber-900 dark:text-amber-300">
              Lineup Notices ({warnings.length})
            </AlertTitle>
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-200 mt-1 space-y-1 leading-relaxed">
              {warnings.map((warn, i) => (
                <div key={i} className="font-medium">• {warn}</div>
              ))}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Swap hint - keyed by generatedAt so it remounts cleanly on regeneration */}
      <p
        key={`hint-${lineup.generatedAt || Date.now()}`}
        id="lineup-swap-hint"
        className="lineup-swap-hint text-xs text-muted-foreground italic px-1"
        role="status"
      >
        {getHintText()}
      </p>

      {/* Sticky Action Buttons Bar */}
      <div className="action-buttons-inline sticky top-2 z-30 flex flex-wrap items-center gap-2 p-3 sm:p-4 rounded-lg border bg-card/95 backdrop-blur shadow-md action-buttons">
        <Button
          type="button"
          variant="default"
          size="sm"
          id="openMatchday"
          data-action="openMatchday"
          onClick={onOpenMatchday}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground font-semibold shadow-sm btn-matchday cursor-pointer"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Live Match
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          id="copyLineup"
          data-action="copyLineup"
          onClick={onCopyLineup}
          className="flex items-center gap-1.5 text-xs btn-copy"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          id="shareLineup"
          data-action="shareLineup"
          onClick={onShareLineup}
          className="dropdown-trigger flex items-center gap-1.5 text-xs btn-share cursor-pointer"
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          id="exportPdf"
          data-action="exportPdf"
          onClick={onExportPdf}
          className="flex items-center gap-1.5 text-xs btn-pdf cursor-pointer"
        >
          <FileDown className="h-3.5 w-3.5 text-primary" />
          AYSO PDF
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          id="exportCSV"
          data-action="exportCSV"
          onClick={onExportCSV}
          className="flex items-center gap-1.5 text-xs btn-csv"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          CSV
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          id="exportLineup"
          data-action="exportLineup"
          onClick={onExportText}
          className="flex items-center gap-1.5 text-xs btn-export"
        >
          <FileText className="h-3.5 w-3.5" />
          Text
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          id="printLineup"
          data-action="printLineup"
          onClick={onPrintLineup}
          className="flex items-center gap-1.5 text-xs btn-print"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          data-action="regenerateLineup"
          onClick={onRegenerate}
          className="flex items-center gap-1.5 text-xs btn-regenerate"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Regenerate
        </Button>

        <Button
          type="button"
          variant="success"
          size="sm"
          id="saveGame"
          data-action="saveGame"
          onClick={onSaveGame}
          className="flex items-center gap-1.5 text-xs ml-auto btn-save-game"
        >
          <Save className="h-3.5 w-3.5" />
          Save Game
        </Button>
      </div>

      {/* Quarters Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="lineupGrid">
          {quarters.map((quarter, qIndex) => {
            const qNum = quarter.quarter || qIndex + 1;
            const positions = quarter.positions || {};
            const sitting = quarter.sitting || [];

            return (
              <Card
                key={qNum}
                className="quarter-lineup overflow-hidden shadow-sm flex flex-col rounded-lg border bg-card"
              >
                <CardHeader className="py-2.5 px-4 bg-muted/30 border-b">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <h3>Quarter {qNum}</h3>
                    <Badge variant="outline" className="text-[10px] font-medium">
                      {Object.keys(positions).length} on Field
                    </Badge>
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-3 flex-1 flex flex-col justify-between space-y-3">
                  {/* Position Table */}
                  {viewMode !== 'pitch' && (
                    <table className="w-full text-xs">
                      <tbody>
                      {canonicalPositions.map((posName) => {
                        const playerVal = positions[posName];
                        const playerName = typeof playerVal === 'string' ? playerVal : (playerVal?.name || 'TBD');
                        const playerObj = typeof playerVal === 'object' ? playerVal : null;
                        const isCaptain = captains.includes(playerName);
                        const isKeeper = posName === 'Keeper';
                        const isSelected =
                          pendingSwap &&
                          Number(pendingSwap.quarter) === Number(qNum) &&
                          pendingSwap.position === posName;

                        const slotObj = { quarter: qNum, position: posName, player: playerName };

                        return (
                          <tr
                            key={posName}
                            draggable={true}
                            tabIndex={0}
                            aria-label={describeSlot(slotObj)}
                            aria-selected={isSelected ? 'true' : 'false'}
                            aria-describedby="lineup-swap-hint"
                            onClick={() => handleToggleSwap(qNum, posName, playerName)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                                e.preventDefault();
                                handleToggleSwap(qNum, posName, playerName);
                              } else if (e.key === 'Escape' && pendingSwapRef.current) {
                                pendingSwapRef.current = null;
                                setPendingSwap(null);
                              }
                            }}
                            onDragStart={(e) => {
                              activeDragSlot = slotObj;
                              window._draggedSlot = slotObj;
                              pendingSwapRef.current = null;
                              setPendingSwap(null);
                              e.currentTarget.classList.add('dragging');
                              try {
                                e.dataTransfer.setData('text/plain', JSON.stringify(slotObj));
                              } catch (_) {}
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={(e) => {
                              activeDragSlot = null;
                              window._draggedSlot = null;
                              e.currentTarget.classList.remove('dragging');
                              document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              e.currentTarget.classList.add('drag-over');
                            }}
                            onDragLeave={(e) => {
                              e.currentTarget.classList.remove('drag-over');
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.currentTarget.classList.remove('drag-over');
                              let from = activeDragSlot || window._draggedSlot;
                              if (!from) {
                                try {
                                  from = JSON.parse(e.dataTransfer.getData('text/plain'));
                                } catch (_) {}
                              }
                              activeDragSlot = null;
                              window._draggedSlot = null;
                              if (from && onSwapPositions) {
                                onSwapPositions(from.quarter, from.position, qNum, posName);
                              }
                            }}
                            className={cn(
                              "draggable-row border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer select-none",
                              isKeeper && "keeper-row bg-amber-500/5 font-medium",
                              isSelected && "swap-selected bg-primary/10 border-primary font-semibold ring-1 ring-primary"
                            )}
                            data-quarter={String(qNum)}
                            data-position={posName}
                            data-player={playerName}
                          >
                            <td className="position py-1.5 pr-2 font-semibold text-muted-foreground w-24 truncate">
                              {posName}:
                            </td>
                            <td className="player-name py-1.5 flex items-center gap-1 truncate">
                              {playerObj?.number != null && (
                                <span className="player-number text-[11px] font-bold text-muted-foreground">
                                  #{playerObj.number}
                                </span>
                              )}
                              {isCaptain && (
                                <span className="captain-star text-amber-500 dark:text-amber-400 shrink-0 text-xs">⭐</span>
                              )}
                              <span className={cn("truncate font-medium text-foreground", isCaptain && "font-semibold text-amber-600 dark:text-amber-300")}>
                                {playerName}
                              </span>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Sitting Players */}
                      {sitting.map((sitVal, sIdx) => {
                        const sitName = typeof sitVal === 'string' ? sitVal : (sitVal?.name || '');
                        const sitObj = typeof sitVal === 'object' ? sitVal : null;
                        const isCaptain = captains.includes(sitName);
                        const sitPosKey = `Sitting:${sitName}`;
                        const isSelected =
                          pendingSwap &&
                          Number(pendingSwap.quarter) === Number(qNum) &&
                          pendingSwap.position === sitPosKey;
                        const slotObj = { quarter: qNum, position: sitPosKey, player: sitName };

                        return (
                          <tr
                            key={`sit-${sitName}-${sIdx}`}
                            draggable={true}
                            tabIndex={0}
                            aria-label={describeSlot(slotObj)}
                            aria-selected={isSelected ? 'true' : 'false'}
                            aria-describedby="lineup-swap-hint"
                            onClick={() => handleToggleSwap(qNum, sitPosKey, sitName)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                                e.preventDefault();
                                handleToggleSwap(qNum, sitPosKey, sitName);
                              } else if (e.key === 'Escape' && pendingSwapRef.current) {
                                pendingSwapRef.current = null;
                                setPendingSwap(null);
                              }
                            }}
                            onDragStart={(e) => {
                              activeDragSlot = slotObj;
                              window._draggedSlot = slotObj;
                              pendingSwapRef.current = null;
                              setPendingSwap(null);
                              e.currentTarget.classList.add('dragging');
                              try {
                                e.dataTransfer.setData('text/plain', JSON.stringify(slotObj));
                              } catch (_) {}
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={(e) => {
                              activeDragSlot = null;
                              window._draggedSlot = null;
                              e.currentTarget.classList.remove('dragging');
                              document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              e.currentTarget.classList.add('drag-over');
                            }}
                            onDragLeave={(e) => {
                              e.currentTarget.classList.remove('drag-over');
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.currentTarget.classList.remove('drag-over');
                              let from = activeDragSlot || window._draggedSlot;
                              if (!from) {
                                try {
                                  from = JSON.parse(e.dataTransfer.getData('text/plain'));
                                } catch (_) {}
                              }
                              activeDragSlot = null;
                              window._draggedSlot = null;
                              if (from && onSwapPositions) {
                                onSwapPositions(from.quarter, from.position, qNum, sitPosKey);
                              }
                            }}
                            className={cn(
                              "sitting-row draggable-row border-b border-border/50 last:border-0 text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer select-none",
                              isSelected && "swap-selected bg-primary/10 border-primary font-semibold ring-1 ring-primary"
                            )}
                            data-quarter={String(qNum)}
                            data-position={sitPosKey}
                            data-player={sitName}
                          >
                            <td className="position py-1.5 pr-2 font-semibold text-[11px] text-muted-foreground/80 w-24 truncate">
                              {sIdx === 0 ? 'Resting:' : ''}
                            </td>
                            <td className="player-name py-1.5 flex items-center gap-1 truncate">
                              {sitObj?.number != null && (
                                <span className="player-number text-[11px] font-bold text-muted-foreground">
                                  #{sitObj.number}
                                </span>
                              )}
                              {isCaptain && (
                                <span className="captain-star text-amber-500 dark:text-amber-400 shrink-0 text-xs">⭐</span>
                              )}
                              <span className={cn("truncate font-medium text-foreground", isCaptain && "font-semibold text-amber-600 dark:text-amber-300")}>
                                {sitName}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  )}

                  {/* Field Pitch Diagram */}
                  {viewMode !== 'table' && (
                    <FieldVisualization
                      quarterNumber={qNum}
                      positions={positions}
                      players={playerStats}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

      {/* Player Summary Section */}
      {playerStats.length > 0 && (
        <Card className="player-summary overflow-hidden shadow-sm border bg-card">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-semibold tracking-tight">Player Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b">
                <tr>
                  {SUMMARY_HEADERS.map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {playerStats.map((player) => {
                  const cells = summaryCells(player);
                  return (
                    <tr key={player.name} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="rest-checkbox h-3.5 w-3.5 rounded border-primary cursor-pointer accent-primary"
                          title="Check to ensure this player rests at least 1 quarter"
                          aria-label={`Must rest at least one quarter for ${player.name}`}
                          checked={Boolean(player.mustRest)}
                          onChange={() => onToggleMustRest && onToggleMustRest(player.name)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="no-keeper-checkbox h-3.5 w-3.5 rounded border-primary cursor-pointer accent-primary"
                          title="Check to prevent this player from playing keeper"
                          aria-label={`Never play keeper for ${player.name}`}
                          checked={Boolean(player.noKeeper)}
                          onChange={() => onToggleNoKeeper && onToggleNoKeeper(player.name)}
                        />
                      </td>
                      {cells.map((text, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 whitespace-nowrap">
                          {text}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
