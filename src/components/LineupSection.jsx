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
  ChevronDown,
  MoreHorizontal,
  Smartphone,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { FieldVisualization } from './FieldVisualization';
import { getPositionsForFormation } from '@/modules/formations';
import { sittingInQuarter, unavoidableImbalance } from '@/modules/lineup-engine';
import { quarterLineStrength, LINES } from '@/modules/line-strength';
import { SUMMARY_HEADERS, summaryCells } from '@/modules/player-summary';
import { safeGetFromStorage, safeSetToStorage } from '@/modules/storage';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

let activeDragSlot = null;

const VIEW_MODE_KEY = 'shinguard_lineup_view';
const VIEW_MODES = ['all', 'table', 'pitch'];

/**
 * On a phone the quarters stack, and Combined drew each one twice: the list,
 * then a ~500px pitch showing the same seven players by shirt number alone.
 * Four of those put Quarter 1 some 3,000px down a 7,600px page. The list is
 * the half a coach can read names off and swap in, so it is what a phone
 * starts on; the pitch is one tap away, and whichever the coach picks is kept.
 * Above md the quarters sit side by side and Combined has the room.
 */
function initialViewMode() {
  const stored = safeGetFromStorage(VIEW_MODE_KEY);
  if (VIEW_MODES.includes(stored)) return stored;
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches;
  return phone ? 'table' : 'all';
}

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
  // A lineup someone else shared: shown, not edited. Nothing here may change
  // it, and nothing may claim it was checked — it came in a link.
  readOnly = false,
  // A Live Match on this device that was started and not finished
  matchInProgress = false,
}) {
  const [viewMode, setViewModeState] = useState(initialViewMode); // 'all', 'table', 'pitch'
  const setViewMode = (mode) => {
    setViewModeState(mode);
    safeSetToStorage(VIEW_MODE_KEY, mode);
  };
  const [mobileQuarter, setMobileQuarter] = useState('all'); // 'all', 1, 2, 3, 4
  const [showAllActions, setShowAllActions] = useState(false); // phone only; see the bar below
  const [pendingSwap, setPendingSwap] = useState(null); // { quarter, position, player }
  const pendingSwapRef = useRef(null);

  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (!touchStartXRef.current) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Primarily horizontal swipe (> 45px)
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      if (deltaX < 0) {
        // Swiped left -> Next quarter
        handleNextMobileQuarter();
      } else {
        // Swiped right -> Previous quarter
        handlePrevMobileQuarter();
      }
    }
  };

  const handleNextMobileQuarter = () => {
    setMobileQuarter((prev) => {
      const next = prev === 'all' ? 2 : prev === 4 ? 1 : prev + 1;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(15); } catch (_) {
          // Ignore vibration failures when unsupported or blocked by browser permissions
        }
      }
      return next;
    });
  };

  const handlePrevMobileQuarter = () => {
    setMobileQuarter((prev) => {
      const prevQ = prev === 'all' ? 4 : prev === 1 ? 4 : prev - 1;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(15); } catch (_) {
          // Ignore vibration failures when unsupported or blocked by browser permissions
        }
      }
      return prevQ;
    });
  };

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

  // When nobody sits, some D/O imbalances are arithmetic, not the generator's
  // doing — say so, or a coach with exactly seven reads them as a bug.
  const fieldedNames = new Set(
    quarters.flatMap((q) =>
      Object.values(q?.positions || {})
        .map((value) => (typeof value === 'string' ? value : value?.name))
        .filter(Boolean)
    )
  );
  const nobodySat = quarters.every((q) => sittingInQuarter(q, playerStats).length === 0);
  const forcedImbalance = nobodySat
    ? unavoidableImbalance(canonicalPositions, fieldedNames.size, quarters.length)
    : { count: 0 };
  const imbalanceWarningCount = warnings.filter((w) => w.includes('D/O imbalance')).length;
  const explainImbalance = forcedImbalance.count > 0 && imbalanceWarningCount > 0;

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
    if (readOnly) return;
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
            aria-pressed={viewMode === 'all'}
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
            aria-pressed={viewMode === 'table'}
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
            aria-pressed={viewMode === 'pitch'}
            onClick={() => setViewMode('pitch')}
            className="text-xs h-7 px-2.5 flex items-center gap-1.5 cursor-pointer"
          >
            <MapPin className="h-3.5 w-3.5" />
            Pitch Only
          </Button>
        </div>
      </div>

      {/* Validation Messages. Not for a shared lineup: its warnings were not
          sent, so "compliant" would be a claim nobody checked. */}
      {!readOnly && (
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
              {explainImbalance && (
                <p id="unavoidableImbalanceNote" className="mt-2 border-t border-amber-500/20 pt-2">
                  <strong className="font-semibold">
                    {forcedImbalance.count === imbalanceWarningCount
                      ? `${imbalanceWarningCount === 1 ? 'This imbalance' : `These ${imbalanceWarningCount} imbalances`} can't be avoided.`
                      : `${forcedImbalance.count} of the ${imbalanceWarningCount} imbalances can't be avoided.`}
                  </strong>{' '}
                  With {forcedImbalance.players} players nobody sits, and {lineup.formation} has{' '}
                  {forcedImbalance.defensiveTotal} quarters at the back to share ({forcedImbalance.defensivePerQuarter} a
                  quarter, keeper included) where an even split for everyone uses {forcedImbalance.evenTotal}. So{' '}
                  {forcedImbalance.count === 1 ? 'one player has' : `${forcedImbalance.count} players have`} to play{' '}
                  {forcedImbalance.forcedDefensive} {forcedImbalance.forcedDefensive === 1 ? 'quarter' : 'quarters'} at the back.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      )}

      {/* Swap hint - keyed by generatedAt so it remounts cleanly on regeneration */}
      {!readOnly && (
      <p
        key={`hint-${lineup.generatedAt || Date.now()}`}
        id="lineup-swap-hint"
        className="lineup-swap-hint text-xs text-muted-foreground italic px-1"
        role="status"
      >
        {getHintText()}
      </p>
      )}

      {/* Sticky matchday bar.
       *
       * Nine buttons wrapping at 390px, each clamped to 44px by the touch rule
       * in index.css, made a 174px block — a fifth of an iPhone viewport, held
       * there for all 7,296px of this page, and at the foot of it it covered
       * the Player Summary's own header row.
       *
       * Only two of the nine are things a coach does with a game running, so
       * on a phone only those two and the quarter selector stay out; Copy,
       * Share, AYSO PDF, CSV, Text, Print and Regenerate collapse behind More.
       * Above md every one of them is visible exactly as before — the desktop
       * layout is dense on purpose and has the room.
       */}
      <div className={cn(
        "action-buttons-inline sticky top-2 z-30 flex flex-wrap items-center gap-2 p-3 sm:p-4 rounded-lg border bg-card/95 backdrop-blur shadow-md action-buttons",
        // Only the quarter selector is left, and it is a phone control
        readOnly && "md:hidden"
      )}>
        {!readOnly && (<>
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
          {matchInProgress ? 'Resume Match' : 'Live Match'}
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          id="copyLineup"
          data-action="copyLineup"
          onClick={onCopyLineup}
          className={cn("flex items-center gap-1.5 text-xs btn-copy", !showAllActions && "hidden md:flex")}
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
          className={cn("dropdown-trigger flex items-center gap-1.5 text-xs btn-share cursor-pointer", !showAllActions && "hidden md:flex")}
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
          className={cn("flex items-center gap-1.5 text-xs btn-pdf cursor-pointer", !showAllActions && "hidden md:flex")}
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
          className={cn("flex items-center gap-1.5 text-xs btn-csv", !showAllActions && "hidden md:flex")}
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
          className={cn("flex items-center gap-1.5 text-xs btn-export", !showAllActions && "hidden md:flex")}
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
          className={cn("flex items-center gap-1.5 text-xs btn-print", !showAllActions && "hidden md:flex")}
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
          className={cn("flex items-center gap-1.5 text-xs btn-regenerate", !showAllActions && "hidden md:flex")}
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

        <Button
          type="button"
          variant="outline"
          size="sm"
          data-action="toggleActions"
          aria-expanded={showAllActions}
          aria-label={showAllActions ? 'Hide export and print actions' : 'Show export and print actions'}
          onClick={() => setShowAllActions((open) => !open)}
          className="flex md:hidden items-center gap-1.5 text-xs btn-more-actions"
        >
          {showAllActions
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <MoreHorizontal className="h-3.5 w-3.5" />}
          More
        </Button>
        </>)}

        {/* The quarter selector, inside the sticky bar rather than below it.
            It is what collapses this page from four stacked quarters to one,
            and it used to sit at the top of a 7,296px scroll — so by the time
            a coach could see the quarter they wanted, the control for picking
            it was several screens behind them. w-full makes it a wrapped row
            of the same flex container. */}
        <div className="w-full flex md:hidden items-center gap-2 pt-2 border-t">
        {/* The prev/next chevrons that used to bracket these chips are gone.
            Five chips and two chevrons, each clamped to a 44px tap target,
            came to 340px in a 332px row — and stepping through the quarters
            one at a time is what the swipe on the grid below already does.
            Picking a quarter is one tap either way. */}
        <div className="flex flex-1 items-center gap-1">
          <Button
            type="button"
            variant={mobileQuarter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMobileQuarter('all')}
            className="h-7 flex-1 px-2 text-[11px] font-bold"
          >
            All
          </Button>
          {[1, 2, 3, 4].map((qNum) => (
            <Button
              key={qNum}
              type="button"
              variant={mobileQuarter === qNum ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMobileQuarter(qNum)}
              className="h-7 flex-1 px-2 text-[11px] font-bold"
            >
              Q{qNum}
            </Button>
          ))}
        </div>

        </div>
      </div>

      {/* Quarters Display */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        id="lineupGrid"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
          {quarters.map((quarter, qIndex) => {
            const qNum = quarter.quarter || qIndex + 1;
            const positions = quarter.positions || {};
            const sitting = sittingInQuarter(quarter, playerStats);
            const strength = quarterLineStrength(quarter, playerStats);
            const shownLines = strength ? LINES.filter((l) => strength[l.key] != null) : [];

            return (
              <Card
                key={qNum}
                className={cn(
                  "quarter-lineup overflow-hidden shadow-sm flex flex-col rounded-lg border bg-card transition-opacity",
                  mobileQuarter !== 'all' && Number(mobileQuarter) !== Number(qNum) ? "hidden md:flex" : "flex"
                )}
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
                    <div className="overflow-x-auto">
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
                            draggable={!readOnly}
                            tabIndex={readOnly ? undefined : 0}
                            aria-label={describeSlot(slotObj)}
                            aria-selected={isSelected ? 'true' : 'false'}
                            aria-describedby={readOnly ? undefined : 'lineup-swap-hint'}
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
                              } catch (_) {
                                // Fallback when clipboard dataTransfer is restricted by platform
                              }
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
                                } catch (_) {
                                  // Fallback when clipboard data cannot be parsed
                                }
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
                              isSelected && "swap-selected bg-primary/10 border-primary font-semibold ring-1 ring-primary",
                              readOnly && "cursor-default"
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
                            draggable={!readOnly}
                            tabIndex={readOnly ? undefined : 0}
                            aria-label={describeSlot(slotObj)}
                            aria-selected={isSelected ? 'true' : 'false'}
                            aria-describedby={readOnly ? undefined : 'lineup-swap-hint'}
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
                              } catch (_) {
                                // Fallback when clipboard dataTransfer is restricted by platform
                              }
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
                                } catch (_) {
                                  // Fallback when clipboard data cannot be parsed
                                }
                              }
                              activeDragSlot = null;
                              window._draggedSlot = null;
                              if (from && onSwapPositions) {
                                onSwapPositions(from.quarter, from.position, qNum, sitPosKey);
                              }
                            }}
                            className={cn(
                              "sitting-row draggable-row border-b border-border/50 last:border-0 text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer select-none",
                              isSelected && "swap-selected bg-primary/10 border-primary font-semibold ring-1 ring-primary",
                              readOnly && "cursor-default"
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
                  </div>
                  )}

                  {/* Field Pitch Diagram */}
                  {viewMode !== 'table' && (
                    <FieldVisualization
                      quarterNumber={qNum}
                      positions={positions}
                      players={playerStats}
                    />
                  )}

                  {shownLines.length > 0 && (
                    <div
                      className="line-strength flex items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground"
                      data-line-strength={String(qNum)}
                      title="Average player rating on each line. Unrated players count as 3."
                      aria-label={`Average rating: ${shownLines.map((l) => `${l.label} ${strength[l.key].toFixed(1)}`).join(', ')}`}
                    >
                      {shownLines.map((l) => (
                        <span key={l.key} data-line={l.key} className="whitespace-nowrap" aria-hidden="true">
                          {l.label}{' '}
                          <span className="font-semibold tabular-nums text-foreground">
                            ★{strength[l.key].toFixed(1)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

      {/* Player Summary Section */}
      {/* The rotation rules it sets belong to the roster this lineup was
          made from, which is not on this device */}
      {!readOnly && playerStats.length > 0 && (
        <Card className="player-summary overflow-hidden shadow-sm border bg-card">
          <CardHeader className="py-3 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-semibold tracking-tight">Player Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* 1,113px of table in a 356px window on a phone. The name column
                is pinned so the coach reading across a row can still see whose
                row it is; everything else scrolls under it. The pinned cells
                need an opaque background of their own — the thead's bg-muted/40
                is a tint, and the columns would scroll visibly through it. */}
            <ScrollArea className="w-full">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {SUMMARY_HEADERS.map((header, hIdx) => (
                      <th
                        key={header}
                        scope="col"
                        className={cn(
                          "px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap",
                          hIdx === 0 && "sticky left-0 z-20 bg-card border-r"
                        )}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {playerStats.map((player) => {
                    // `captains` is where the armband lives; the roster rows
                    // carry an `isCaptain` only as of the last time they were
                    // persisted, and the engine hands its copies of them
                    // straight through to here. Generating picks a fresh pair,
                    // so reading that field named the previous one — while the
                    // quarter cards above, which read `captains`, named the new
                    // one.
                    const cells = summaryCells({
                      ...player,
                      isCaptain: captains.includes(player.name),
                    });
                    return (
                      <tr key={player.name} className="hover:bg-muted/30 transition-colors">
                        <td className="sticky left-0 z-10 bg-card border-r px-3 py-2 whitespace-nowrap font-medium">
                          {cells[0]}
                        </td>
                        <td className="px-3 py-2">
                          {/* The label, not the box, is the tap target. A bare
                              14px checkbox is unhittable on a phone and the cell
                              padding around it is not clickable, so the coach was
                              aiming at a 14x14 square to set a rotation rule. */}
                          <label className="flex min-h-11 min-w-11 items-center justify-center sm:min-h-0 sm:min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rest-checkbox h-3.5 w-3.5 rounded border-primary cursor-pointer accent-primary"
                              title="Check to ensure this player rests at least 1 quarter"
                              aria-label={`Must rest at least one quarter for ${player.name}`}
                              checked={Boolean(player.mustRest)}
                              onChange={() => onToggleMustRest && onToggleMustRest(player.name)}
                            />
                          </label>
                        </td>
                        <td className="px-3 py-2">
                          <label className="flex min-h-11 min-w-11 items-center justify-center sm:min-h-0 sm:min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              className="no-keeper-checkbox h-3.5 w-3.5 rounded border-primary cursor-pointer accent-primary"
                              title="Check to prevent this player from playing keeper"
                              aria-label={`Never play keeper for ${player.name}`}
                              checked={Boolean(player.noKeeper)}
                              onChange={() => onToggleNoKeeper && onToggleNoKeeper(player.name)}
                            />
                          </label>
                        </td>
                        {cells.slice(1).map((text, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 whitespace-nowrap">
                            {text}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
