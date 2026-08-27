import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  MapPin,
  Shirt,
  Plus,
  Share2,
  CalendarCheck,
  CalendarPlus,
  FileSpreadsheet,
  Users,
  Edit2,
  Trash2,
  Play,
  ClipboardList,
  Cookie,
  Apple,
  Flag,
  Wrench,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  formatMatchDate,
  formatTimeString,
  formatParentMemo,
  generateIcsEvent,
  generateSeasonIcs,
  calculateVolunteerStats,
  exportScheduleCsv,
} from '@/modules/schedule';
import { downloadTextFile } from '@/modules/export';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function ScheduleTab({
  fixtures = [],
  players = [],
  teamName = 'Our Team',
  ageDivision = '10U',
  onAddFixture,
  onEditFixture,
  onDeleteFixture,
  onGenerateLineupForFixture,
  onLaunchMatchdayForFixture,
}) {
  const [filter, setFilter] = useState('all'); // 'all' | 'upcoming' | 'completed'
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);

  const volunteerStats = calculateVolunteerStats(fixtures, players);

  // Sort fixtures chronologically
  const sortedFixtures = [...(fixtures || [])].sort((a, b) => {
    const dateA = a.gameDate || '';
    const dateB = b.gameDate || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.gameTime || '').localeCompare(b.gameTime || '');
  });

  const nowStr = new Date().toISOString().split('T')[0];

  const upcomingFixtures = sortedFixtures.filter(
    (f) => f.status === 'upcoming' && (f.gameDate >= nowStr || !f.status || f.status === 'upcoming')
  );
  const completedFixtures = sortedFixtures.filter((f) => f.status === 'completed' || (f.status !== 'canceled' && f.gameDate < nowStr));

  const filteredFixtures = sortedFixtures.filter((f) => {
    if (filter === 'upcoming') return f.status === 'upcoming' || (f.status !== 'completed' && f.status !== 'canceled' && f.gameDate >= nowStr);
    if (filter === 'completed') return f.status === 'completed' || (f.status !== 'canceled' && f.gameDate < nowStr);
    return true;
  });

  // Next upcoming match spotlight
  const nextMatch = upcomingFixtures[0] || (sortedFixtures.length > 0 ? sortedFixtures[0] : null);

  const handleShareMemo = (fixture) => {
    const memo = formatParentMemo(fixture, teamName);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(memo);
      toast.success('📋 Match reminder memo copied to clipboard!');
    } else {
      toast.info('Clipboard not available');
    }
  };

  const handleDownloadSingleIcs = (fixture) => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AYSO Roster Pro//Match Calendar//EN',
      'CALSCALE:GREGORIAN',
      generateIcsEvent(fixture, teamName, ageDivision),
      'END:VCALENDAR',
    ].join('\r\n');

    const cleanOpponent = (fixture.opponent || 'match').toLowerCase().replace(/[^a-z0-9]/g, '-');
    downloadTextFile(`match-${cleanOpponent}-${fixture.gameDate || 'game'}.ics`, icsContent, 'text/calendar;charset=utf-8');
    toast.success('📅 Match calendar (.ics) downloaded!');
  };

  const handleDownloadSeasonIcs = () => {
    if (!fixtures || fixtures.length === 0) {
      toast.error('No fixtures scheduled to export.');
      return;
    }
    const icsContent = generateSeasonIcs(fixtures, teamName, ageDivision);
    const cleanTeam = teamName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    downloadTextFile(`${cleanTeam}-season-schedule.ics`, icsContent, 'text/calendar;charset=utf-8');
    toast.success('📅 Full season calendar (.ics) downloaded!');
  };

  const handleExportCsv = () => {
    if (!fixtures || fixtures.length === 0) {
      toast.error('No fixtures to export.');
      return;
    }
    const csvContent = exportScheduleCsv(fixtures, teamName);
    const cleanTeam = teamName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    downloadTextFile(`${cleanTeam}-schedule.csv`, csvContent, 'text/csv;charset=utf-8');
    toast.success('📊 Schedule CSV downloaded!');
  };

  return (
    <div className="space-y-6">
      {/* Next Match Spotlight Hero */}
      {nextMatch && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b bg-primary/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-primary text-primary-foreground text-xs px-2.5 py-0.5">
                  <Sparkles className="h-3 w-3 mr-1" /> Next Matchday Spotlight
                </Badge>
                <Badge variant="outline" className="text-xs bg-background">
                  {nextMatch.homeAway === 'away' ? '✈️ Away Match' : '🏠 Home Match'}
                </Badge>
              </div>
              <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatMatchDate(nextMatch.gameDate, nextMatch.gameTime, 'long')}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  <span className="text-primary">{teamName}</span>
                  <span className="text-muted-foreground font-normal text-base sm:text-lg">vs</span>
                  <span>{nextMatch.opponent}</span>
                </h3>

                {nextMatch.location && (
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground mt-1.5">
                    <MapPin className="h-4 w-4 text-rose-500 shrink-0" />
                    <span>{nextMatch.location}</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nextMatch.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-primary hover:underline ml-1"
                      title="Open in Google Maps"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Jersey Chip */}
              {nextMatch.jerseyColor && (
                <div className="flex items-center gap-2 self-start sm:self-auto bg-muted/60 px-3 py-1.5 rounded-lg border">
                  <Shirt className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">
                    Jersey: <strong className="text-foreground">{nextMatch.jerseyColor}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Volunteer Duty Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t text-xs">
              <div className="p-2 rounded bg-muted/40 border">
                <div className="text-muted-foreground flex items-center gap-1 mb-0.5">
                  <Apple className="h-3.5 w-3.5 text-orange-500" /> Halftime Fruit
                </div>
                <div className="font-semibold truncate">
                  {nextMatch.fruitParent ? (
                    <span className="text-foreground">{nextMatch.fruitParent}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Unassigned
                    </span>
                  )}
                </div>
              </div>

              <div className="p-2 rounded bg-muted/40 border">
                <div className="text-muted-foreground flex items-center gap-1 mb-0.5">
                  <Cookie className="h-3.5 w-3.5 text-amber-500" /> Post-Game Snack
                </div>
                <div className="font-semibold truncate">
                  {nextMatch.snackParent ? (
                    <span className="text-foreground">{nextMatch.snackParent}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Unassigned
                    </span>
                  )}
                </div>
              </div>

              <div className="p-2 rounded bg-muted/40 border">
                <div className="text-muted-foreground flex items-center gap-1 mb-0.5">
                  <Flag className="h-3.5 w-3.5 text-emerald-500" /> Referee / Lines
                </div>
                <div className="font-semibold truncate text-foreground">
                  {nextMatch.refereeDuty || <span className="text-muted-foreground font-normal">Optional</span>}
                </div>
              </div>

              <div className="p-2 rounded bg-muted/40 border">
                <div className="text-muted-foreground flex items-center gap-1 mb-0.5">
                  <Wrench className="h-3.5 w-3.5 text-blue-500" /> Field Setup
                </div>
                <div className="font-semibold truncate text-foreground">
                  {nextMatch.fieldSetup || <span className="text-muted-foreground font-normal">Optional</span>}
                </div>
              </div>
            </div>

            {/* Quick Action Toolbar for Next Match */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                size="sm"
                className="flex items-center gap-1.5 text-xs font-semibold"
                onClick={() => onGenerateLineupForFixture && onGenerateLineupForFixture(nextMatch)}
              >
                <ClipboardList className="h-4 w-4" /> Generate Lineup
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex items-center gap-1.5 text-xs font-semibold"
                onClick={() => onLaunchMatchdayForFixture && onLaunchMatchdayForFixture(nextMatch)}
              >
                <Play className="h-4 w-4 fill-current text-primary" /> Live Matchday
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex items-center gap-1.5 text-xs"
                onClick={() => handleShareMemo(nextMatch)}
              >
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" /> Copy Parent Memo
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex items-center gap-1.5 text-xs"
                onClick={() => handleDownloadSingleIcs(nextMatch)}
              >
                <CalendarPlus className="h-3.5 w-3.5 text-muted-foreground" /> Add to Calendar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Season Stats & Volunteer Coverage summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10 text-primary">
              <CalendarCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">
                {fixtures.length}
              </div>
              <div className="text-xs text-muted-foreground">
                Matches Scheduled ({upcomingFixtures.length} upcoming)
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Cookie className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">
                {volunteerStats.snackCoveragePct}%
              </div>
              <div className="text-xs text-muted-foreground">
                Snack Coverage ({fixtures.length - volunteerStats.unassignedSnackFixtures}/{fixtures.length || 1} assigned)
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">
                {volunteerStats.assignedPlayers.length}/{players.length || 1}
              </div>
              <div className="text-xs text-muted-foreground">
                Families Participating
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fixtures List Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted p-1 text-muted-foreground">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold transition-all',
                filter === 'all' && 'bg-background text-foreground shadow-sm'
              )}
            >
              All ({sortedFixtures.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('upcoming')}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold transition-all',
                filter === 'upcoming' && 'bg-background text-foreground shadow-sm'
              )}
            >
              Upcoming ({upcomingFixtures.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('completed')}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold transition-all',
                filter === 'completed' && 'bg-background text-foreground shadow-sm'
              )}
            >
              Completed ({completedFixtures.length})
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsMatrixOpen(!isMatrixOpen)}
            className="text-xs h-8 flex items-center gap-1.5"
          >
            <Users className="h-3.5 w-3.5 text-primary" />
            {isMatrixOpen ? 'Hide Volunteer Matrix' : 'Volunteer Duty Matrix'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadSeasonIcs}
            className="text-xs h-8 flex items-center gap-1.5"
            title="Export full season schedule to Apple/Google Calendar"
          >
            <Calendar className="h-3.5 w-3.5" /> Export Calendar (.ics)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="text-xs h-8 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button
            size="sm"
            onClick={onAddFixture}
            className="text-xs h-8 flex items-center gap-1.5 font-semibold"
          >
            <Plus className="h-4 w-4" /> Add Match
          </Button>
        </div>
      </div>

      {/* Volunteer Duty Matrix Drawer / Panel */}
      {isMatrixOpen && (
        <Card className="border-primary/20 bg-card shadow-sm animate-in fade-in duration-200">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Season Volunteer Duty Roster
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {volunteerStats.unassignedPlayers.length} families not yet assigned
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] tracking-wider border-b">
                  <tr>
                    <th className="p-2">Player / Family</th>
                    <th className="p-2 text-center">Halftime Fruit</th>
                    <th className="p-2 text-center">Post-Game Snack</th>
                    <th className="p-2 text-center">Referee / Lines</th>
                    <th className="p-2 text-center">Field Setup</th>
                    <th className="p-2 text-center">Total Duties</th>
                    <th className="p-2">Assigned Matches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {volunteerStats.playerList.map((playerStat) => (
                    <tr key={playerStat.name} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2 font-medium text-foreground flex items-center gap-1.5">
                        {playerStat.name}
                        {playerStat.totalDuties === 0 && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1 font-normal bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            Needs Duty
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-center">{playerStat.fruitCount || '-'}</td>
                      <td className="p-2 text-center">{playerStat.snackCount || '-'}</td>
                      <td className="p-2 text-center">{playerStat.refereeCount || '-'}</td>
                      <td className="p-2 text-center">{playerStat.fieldSetupCount || '-'}</td>
                      <td className="p-2 text-center font-bold">
                        <Badge
                          variant={playerStat.totalDuties > 0 ? 'default' : 'outline'}
                          className="text-[11px] px-2 py-0"
                        >
                          {playerStat.totalDuties}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground text-[11px]">
                        {playerStat.assignments.length > 0
                          ? playerStat.assignments.map((a, i) => `${a.duty} vs ${a.opponent} (${a.date})`).join(', ')
                          : 'None'}
                      </td>
                    </tr>
                  ))}
                  {volunteerStats.playerList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-muted-foreground">
                        No players on roster. Add players to track volunteer family duties.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Match Fixtures Cards */}
      <div className="space-y-3">
        {filteredFixtures.length === 0 ? (
          <Card className="border-dashed p-8 text-center bg-card/50">
            <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-60" />
            <h4 className="text-base font-semibold text-foreground">No matches scheduled</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
              Add your upcoming AYSO season games to manage kickoff times, locations, jersey colors, and snack duty rotations.
            </p>
            <Button size="sm" onClick={onAddFixture} className="text-xs">
              <Plus className="h-4 w-4 mr-1" /> Schedule First Match
            </Button>
          </Card>
        ) : (
          filteredFixtures.map((fixture) => {
            const isCompleted = fixture.status === 'completed';
            const isCanceled = fixture.status === 'canceled';

            return (
              <Card
                key={fixture.id || `${fixture.gameDate}-${fixture.opponent}`}
                className={cn(
                  'transition-all hover:border-primary/40 bg-card shadow-sm',
                  isCompleted && 'opacity-85 bg-muted/20',
                  isCanceled && 'opacity-60 bg-muted/40'
                )}
              >
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Date badge + Opponent info */}
                  <div className="flex items-start gap-3 sm:gap-4 flex-1">
                    {/* Date Block */}
                    <div className="flex flex-col items-center justify-center rounded-lg bg-primary/10 text-primary px-3 py-2 shrink-0 min-w-[70px] text-center border border-primary/20">
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {formatMatchDate(fixture.gameDate, '', 'short').split(' ')[0]}
                      </span>
                      <span className="text-lg font-black leading-tight">
                        {fixture.gameDate ? fixture.gameDate.split('-')[2] : '—'}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {fixture.gameTime ? formatTimeString(fixture.gameTime) : 'TBD'}
                      </span>
                    </div>

                    {/* Match Info */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-foreground">
                          vs {fixture.opponent}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-semibold px-2 py-0',
                            fixture.homeAway === 'away'
                              ? 'bg-sky-500/10 text-sky-600 border-sky-300 dark:text-sky-400'
                              : 'bg-emerald-500/10 text-emerald-600 border-emerald-300 dark:text-emerald-400'
                          )}
                        >
                          {fixture.homeAway === 'away' ? '✈️ Away' : '🏠 Home'}
                        </Badge>
                        {isCompleted && (
                          <Badge variant="secondary" className="text-[10px] py-0">
                            Completed
                          </Badge>
                        )}
                        {isCanceled && (
                          <Badge variant="destructive" className="text-[10px] py-0">
                            Canceled
                          </Badge>
                        )}
                      </div>

                      {/* Location & Jersey */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {fixture.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-rose-500" />
                            {fixture.location}
                          </span>
                        )}
                        {fixture.jerseyColor && (
                          <span className="flex items-center gap-1">
                            <Shirt className="h-3.5 w-3.5 text-primary" />
                            Jersey: <span className="font-medium text-foreground">{fixture.jerseyColor}</span>
                          </span>
                        )}
                      </div>

                      {/* Volunteer duty badges */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                        {fixture.fruitParent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-300 font-medium">
                            <Apple className="h-3 w-3" /> Fruit: {fixture.fruitParent}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                            <Apple className="h-3 w-3" /> Fruit: Unassigned
                          </span>
                        )}

                        {fixture.snackParent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
                            <Cookie className="h-3 w-3" /> Snack: {fixture.snackParent}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                            <Cookie className="h-3 w-3" /> Snack: Unassigned
                          </span>
                        )}

                        {fixture.refereeDuty && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
                            <Flag className="h-3 w-3" /> Ref: {fixture.refereeDuty}
                          </span>
                        )}
                      </div>

                      {/* Coach Note */}
                      {fixture.notes && (
                        <p className="text-xs text-muted-foreground italic pt-0.5">
                          "{fixture.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                    <Button
                      size="sm"
                      variant="default"
                      className="text-xs h-8 flex items-center gap-1 font-semibold"
                      onClick={() => onGenerateLineupForFixture && onGenerateLineupForFixture(fixture)}
                      title="Generate or edit lineup for this match"
                    >
                      <ClipboardList className="h-3.5 w-3.5" /> Lineup
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs h-8 flex items-center gap-1"
                      onClick={() => onLaunchMatchdayForFixture && onLaunchMatchdayForFixture(fixture)}
                      title="Launch live matchday mode for this game"
                    >
                      <Play className="h-3.5 w-3.5 fill-current text-primary" /> Live
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 px-2"
                      onClick={() => handleShareMemo(fixture)}
                      title="Copy parent reminder memo to clipboard"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 px-2"
                      onClick={() => handleDownloadSingleIcs(fixture)}
                      title="Download calendar (.ics) invite"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-8 px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => onEditFixture && onEditFixture(fixture)}
                      title="Edit match details"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-8 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => onDeleteFixture && onDeleteFixture(fixture)}
                      title="Delete match"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
