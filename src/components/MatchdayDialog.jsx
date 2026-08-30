import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  CheckCircle2,
  Trophy,
  Users,
  Shield,
  ArrowRight,
  Save,
  Clock,
} from 'lucide-react';
import { FieldVisualization } from '@/components/FieldVisualization';
import { playWhistleSound } from '@/modules/whistle-audio';
import { toast } from 'sonner';

export function MatchdayDialog({
  isOpen,
  onClose,
  lineup,
  players = [],
  captains = [],
  teamName = 'Our Team',
  ageDivision = '10U',
  initialOpponent = '',
  fixture = null,
  onSaveGame,
}) {
  const defaultMinutes = ageDivision === '10U' ? 12.5 : ageDivision === '12U' ? 15 : 10;
  const [quarterMinutes, setQuarterMinutes] = useState(defaultMinutes);
  const [activeQuarter, setActiveQuarter] = useState(1);
  const [secondsRemaining, setSecondsRemaining] = useState(Math.round(defaultMinutes * 60));
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [opponentName, setOpponentName] = useState(fixture?.opponent || initialOpponent || 'Opponent');
  const [events, setEvents] = useState([]);
  const [selectedFieldPlayer, setSelectedFieldPlayer] = useState(null);
  const [activeLineup, setActiveLineup] = useState(lineup);

  // Sync lineup and opponent when opened
  useEffect(() => {
    if (lineup) {
      setActiveLineup(JSON.parse(JSON.stringify(lineup)));
    }
    if (fixture?.opponent || initialOpponent) {
      setOpponentName(fixture?.opponent || initialOpponent);
    }
  }, [lineup, isOpen, fixture, initialOpponent]);

  // Timer interval
  useEffect(() => {
    let interval = null;
    if (isRunning && secondsRemaining > 0) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            if (soundEnabled) {
              playWhistleSound();
            }
            toast.info(`Quarter ${activeQuarter} time expired!`);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, secondsRemaining, soundEnabled, activeQuarter]);

  if (!isOpen || !activeLineup || !activeLineup.quarters) return null;

  const currentQData = activeLineup.quarters.find(
    (q) => (q.quarter || q) === activeQuarter
  ) || activeLineup.quarters[activeQuarter - 1] || {};

  const positions = currentQData.positions || {};
  const sitting = currentQData.sitting || [];

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTogglePlay = () => {
    if (!isRunning && secondsRemaining === 0) {
      setSecondsRemaining(Math.round(quarterMinutes * 60));
    }
    setIsRunning(!isRunning);
  };

  const handleResetQuarterTimer = () => {
    setIsRunning(false);
    setSecondsRemaining(Math.round(quarterMinutes * 60));
  };

  const handleSelectQuarter = (qNum) => {
    setActiveQuarter(qNum);
    setIsRunning(false);
    setSecondsRemaining(Math.round(quarterMinutes * 60));
  };

  const handleNextQuarter = () => {
    if (activeQuarter < 4) {
      const nextQ = activeQuarter + 1;
      setActiveQuarter(nextQ);
      setIsRunning(false);
      setSecondsRemaining(Math.round(quarterMinutes * 60));
      if (soundEnabled) playWhistleSound();
      toast.success(`Switched to Quarter ${nextQ}`);
    }
  };

  const handleRecordGoal = (playerName) => {
    setHomeScore((prev) => prev + 1);
    const event = {
      id: Date.now(),
      quarter: activeQuarter,
      minute: Math.ceil((quarterMinutes * 60 - secondsRemaining) / 60) || 1,
      type: 'goal',
      player: playerName,
    };
    setEvents((prev) => [event, ...prev]);
    toast.success(`⚽ Goal by ${playerName}!`);
    setSelectedFieldPlayer(null);
  };

  const handleEmergencySub = (fieldPlayerName, benchPlayerName) => {
    if (!fieldPlayerName || !benchPlayerName) return;

    setActiveLineup((prev) => {
      const updated = JSON.parse(JSON.stringify(prev));
      const qIndex = updated.quarters.findIndex(
        (q) => (q.quarter || q) === activeQuarter
      );
      if (qIndex === -1) return prev;

      const q = updated.quarters[qIndex];
      // Find which position fieldPlayerName plays
      let fieldPos = null;
      for (const [pos, val] of Object.entries(q.positions || {})) {
        const name = typeof val === 'string' ? val : val?.name;
        if (name === fieldPlayerName) {
          fieldPos = pos;
          break;
        }
      }

      if (fieldPos) {
        q.positions[fieldPos] = benchPlayerName;
        // Swap with sitting
        const sitIdx = (q.sitting || []).findIndex((s) => {
          const name = typeof s === 'string' ? s : s?.name;
          return name === benchPlayerName;
        });
        if (sitIdx !== -1) {
          q.sitting[sitIdx] = fieldPlayerName;
        }
      }

      return updated;
    });

    const event = {
      id: Date.now(),
      quarter: activeQuarter,
      minute: Math.ceil((quarterMinutes * 60 - secondsRemaining) / 60) || 1,
      type: 'sub',
      description: `Sub: ${benchPlayerName} in for ${fieldPlayerName}`,
    };
    setEvents((prev) => [event, ...prev]);
    toast.info(`Substituted ${benchPlayerName} for ${fieldPlayerName}`);
    setSelectedFieldPlayer(null);
  };

  const handleFinishMatch = () => {
    // An object, not the bare name: the handler destructures { name, date }, so
    // a string saved the match with no name at all — which the cloud then
    // rejected — and no date, leaving Game History showing it as "Recent".
    if (onSaveGame) {
      onSaveGame({
        name: `vs ${opponentName || 'Opponent'} (${homeScore}-${awayScore})`,
        date: fixture?.gameDate || new Date().toISOString().split('T')[0],
      });
    }
    toast.success('Match completed and game saved!');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-card text-foreground">
        {/* Header */}
        {/* Wraps to its own rows on a phone. Held in one rigid row it overflowed
            once the controls were clamped to 44px: the whistle button was pushed
            off the right edge and the close button landed on the opponent field.
            pr-12 is the room the absolutely-positioned close button needs. */}
        <DialogHeader className="pb-3 pr-12 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <DialogTitle className="text-lg sm:text-xl font-bold flex flex-wrap items-center gap-2">
              <Trophy className="h-5 w-5 shrink-0 text-amber-500" />
              Live Matchday: <span className="text-primary">{teamName}</span> vs{' '}
              <Input
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                className="h-7 w-32 sm:w-28 text-xs font-semibold inline-block p-1"
                placeholder="Opponent"
              />
            </DialogTitle>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) playWhistleSound();
              }}
              title={soundEnabled ? 'Mute whistle chime' : 'Enable whistle chime'}
              className="h-8 w-8 p-0"
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-primary" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => playWhistleSound()}
              className="text-xs h-8 flex items-center gap-1"
            >
              🔊 Whistle
            </Button>
          </div>
        </DialogHeader>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Quarter Tabs & Clock Hero */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl border bg-muted/20 items-center">
            {/* Scoreboard */}
            <div className="flex items-center justify-center gap-4 order-2 md:order-1">
              <div className="text-center">
                <p className="text-[11px] font-semibold text-muted-foreground truncate max-w-[80px]">
                  {teamName}
                </p>
                <div className="flex items-center gap-1.5 justify-center mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0 rounded-full"
                    onClick={() => setHomeScore(Math.max(0, homeScore - 1))}
                    aria-label={`Decrease ${teamName} score`}
                    title={`Decrease ${teamName} score`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-2xl font-black w-8 text-center text-foreground">
                    {homeScore}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0 rounded-full"
                    onClick={() => setHomeScore(homeScore + 1)}
                    aria-label={`Increase ${teamName} score`}
                    title={`Increase ${teamName} score`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <span className="text-lg font-bold text-muted-foreground">-</span>

              <div className="text-center">
                <p className="text-[11px] font-semibold text-muted-foreground truncate max-w-[80px]">
                  {opponentName}
                </p>
                <div className="flex items-center gap-1.5 justify-center mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0 rounded-full"
                    onClick={() => setAwayScore(Math.max(0, awayScore - 1))}
                    aria-label={`Decrease ${opponentName} score`}
                    title={`Decrease ${opponentName} score`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-2xl font-black w-8 text-center text-foreground">
                    {awayScore}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0 rounded-full"
                    onClick={() => setAwayScore(awayScore + 1)}
                    aria-label={`Increase ${opponentName} score`}
                    title={`Increase ${opponentName} score`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Quarter Timer Display */}
            <div className="text-center order-1 md:order-2 flex flex-col items-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                {[1, 2, 3, 4].map((qNum) => (
                  <Button
                    key={qNum}
                    type="button"
                    variant={activeQuarter === qNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSelectQuarter(qNum)}
                    className="h-6 px-2 text-[11px] font-bold"
                  >
                    Q{qNum}
                  </Button>
                ))}
              </div>

              <div
                className={`font-mono text-3xl sm:text-4xl font-black tracking-wider my-1 ${
                  secondsRemaining === 0
                    ? 'text-destructive animate-pulse'
                    : secondsRemaining < 60
                    ? 'text-amber-500'
                    : 'text-foreground'
                }`}
              >
                {formatTime(secondsRemaining)}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <Button
                  type="button"
                  variant={isRunning ? 'destructive' : 'default'}
                  size="sm"
                  onClick={handleTogglePlay}
                  className="h-8 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  {isRunning ? (
                    <>
                      <Pause className="h-3.5 w-3.5 fill-current" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" /> Start
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetQuarterTimer}
                  title="Reset quarter clock"
                  className="h-8 px-2 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col items-center md:items-end justify-center gap-2 order-3">
              {activeQuarter < 4 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleNextQuarter}
                  className="w-full sm:w-auto text-xs font-semibold flex items-center gap-1.5"
                >
                  Next Quarter (Q{activeQuarter + 1}) <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  onClick={handleFinishMatch}
                  className="w-full sm:w-auto text-xs font-semibold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> End & Save Match
                </Button>
              )}

              <p className="text-[10px] text-muted-foreground text-center md:text-right">
                Tap any player on the field to log a goal or sub.
              </p>
            </div>
          </div>

          {/* Active Field & Bench */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 2D Pitch View */}
            <div className="md:col-span-2 rounded-xl border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" /> Quarter {activeQuarter} Field
                </h4>
                <Badge variant="outline" className="text-[10px]">
                  {Object.keys(positions).length} on Field
                </Badge>
              </div>

              <FieldVisualization
                quarterNumber={activeQuarter}
                positions={positions}
                players={activeLineup.playerStats || players}
              />
            </div>

            {/* Sideline Bench & Goal Log */}
            <div className="space-y-4 flex flex-col">
              {/* On-field list & tap action */}
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <h4 className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" /> Active Field Roster
                </h4>
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {Object.entries(positions).map(([pos, pVal]) => {
                    const pName = typeof pVal === 'string' ? pVal : pVal?.name || 'TBD';
                    const isCapt = captains.includes(pName);
                    const isSelected = selectedFieldPlayer === pName;

                    return (
                      <div
                        key={pos}
                        onClick={() =>
                          setSelectedFieldPlayer(isSelected ? null : pName)
                        }
                        className={`flex items-center justify-between p-1.5 rounded-md text-xs cursor-pointer transition-colors border ${
                          isSelected
                            ? 'bg-primary/15 border-primary text-primary font-semibold'
                            : 'hover:bg-muted/40 border-transparent'
                        }`}
                      >
                        <span className="font-semibold text-muted-foreground w-16 truncate">
                          {pos}:
                        </span>
                        <div className="flex items-center gap-1 flex-1 truncate">
                          {isCapt && <span className="text-xs">⭐</span>}
                          <span className="truncate text-foreground">{pName}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Player Action Modal / Bar */}
                {selectedFieldPlayer && (
                  <div className="p-2.5 rounded-lg border bg-muted/40 space-y-2 mt-2">
                    <p className="text-[11px] font-bold text-foreground truncate">
                      Action for <span className="text-primary">{selectedFieldPlayer}</span>:
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => handleRecordGoal(selectedFieldPlayer)}
                        className="h-7 text-[11px] px-2 flex items-center gap-1"
                      >
                        ⚽ Goal
                      </Button>

                      {/* Sub dropdown / option if bench players exist */}
                      {sitting.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">Sub for:</span>
                          {sitting.map((sitVal) => {
                            const sitName = typeof sitVal === 'string' ? sitVal : sitVal?.name;
                            return (
                              <Button
                                key={sitName}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleEmergencySub(selectedFieldPlayer, sitName)
                                }
                                className="h-7 text-[10px] px-1.5"
                              >
                                {sitName}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Bench Players */}
              <div className="rounded-xl border bg-card p-3 space-y-2 flex-1">
                <h4 className="text-xs font-bold tracking-tight text-muted-foreground">
                  Resting on Bench ({sitting.length})
                </h4>
                {sitting.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No players resting</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {sitting.map((sitVal) => {
                      const sitName = typeof sitVal === 'string' ? sitVal : sitVal?.name;
                      const isCapt = captains.includes(sitName);
                      return (
                        <Badge
                          key={sitName}
                          variant="secondary"
                          className="text-xs font-medium px-2 py-0.5 flex items-center gap-1"
                        >
                          {isCapt && <span>⭐</span>}
                          {sitName}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Match Timeline / Log */}
          {events.length > 0 && (
            <div className="p-3 rounded-xl border bg-card space-y-2">
              <h4 className="text-xs font-bold tracking-tight flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Match Event Log
              </h4>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {events.map((e) => (
                  <div key={e.id} className="text-xs flex items-center gap-2 text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 font-bold">
                      Q{e.quarter} • {e.minute}'
                    </Badge>
                    <span className="text-foreground">
                      {e.type === 'goal' ? `⚽ Goal scored by ${e.player}` : e.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="pt-3 border-t flex flex-row items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close Match Mode
          </Button>

          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={handleFinishMatch}
            className="text-xs flex items-center gap-1.5 font-semibold"
          >
            <Save className="h-3.5 w-3.5" /> Save Game Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
