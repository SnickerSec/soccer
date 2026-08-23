import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  FileSpreadsheet,
  Trash2,
  Calendar,
  FileText,
  Lightbulb,
  Trophy,
  Users,
  Eye,
} from 'lucide-react';
import { calculatePlayerStats, getLineupRecommendations } from '@/modules/season-stats';
import { PlayerHeatmapCard } from './PlayerHeatmapCard';
import { cn } from '@/lib/utils';

function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Recent';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return dateStr;
}

export function SeasonTab({
  gameHistory = [],
  players = [],
  onExportStats,
  onClearHistory,
  onDeleteGame,
  onOpenNotes,
  onViewGame,
}) {
  const stats = calculatePlayerStats(players, gameHistory);
  const recommendations = getLineupRecommendations(gameHistory, players);

  return (
    <div className="space-y-6">
      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10 text-primary">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight" id="totalGames">
                {gameHistory.length}
              </div>
              <div className="text-xs text-muted-foreground">Total Games Saved</div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-secondary text-secondary-foreground">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight" id="activePlayersCount">
                {players.length}
              </div>
              <div className="text-xs text-muted-foreground">Tracked Squad Players</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations Banner */}
      {recommendations && typeof recommendations === 'object' && (
        (recommendations.shouldKeep?.length > 0) ||
        (recommendations.shouldSit?.length > 0) ||
        (recommendations.shouldCaptain?.length > 0) ||
        (recommendations.needsOffense?.length > 0) ||
        (recommendations.needsDefense?.length > 0)
      ) && (
        <Card className="border-primary/30 bg-primary/5 shadow-sm" id="lineupRecommendations">
          <CardHeader className="py-3 px-4 border-b border-primary/20 flex flex-row items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold text-primary">
              Next Game Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 text-xs space-y-2">
            {recommendations.shouldKeep?.length > 0 && (
              <div>
                <span className="font-semibold text-foreground">Recommended Goalkeepers: </span>
                <span className="text-muted-foreground">
                  {recommendations.shouldKeep.map((p) => p.name).join(', ')}
                </span>
              </div>
            )}
            {recommendations.shouldSit?.length > 0 && (
              <div>
                <span className="font-semibold text-foreground">Rest Priority: </span>
                <span className="text-muted-foreground">
                  {recommendations.shouldSit.map((p) => p.name).join(', ')}
                </span>
              </div>
            )}
            {recommendations.shouldCaptain?.length > 0 && (
              <div>
                <span className="font-semibold text-foreground">Captain Candidates: </span>
                <span className="text-muted-foreground">
                  {recommendations.shouldCaptain.map((p) => p.name).join(', ')}
                </span>
              </div>
            )}
            {recommendations.needsOffense?.length > 0 && (
              <div>
                <span className="font-semibold text-foreground">Needs Offense Time: </span>
                <span className="text-muted-foreground">
                  {recommendations.needsOffense.map((p) => p.name).join(', ')}
                </span>
              </div>
            )}
            {recommendations.needsDefense?.length > 0 && (
              <div>
                <span className="font-semibold text-foreground">Needs Defense Time: </span>
                <span className="text-muted-foreground">
                  {recommendations.needsDefense.map((p) => p.name).join(', ')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Game History List */}
      <Card className="shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-semibold">Game History</CardTitle>
        </CardHeader>
        <CardContent className="p-0" id="gameHistoryList">
          {gameHistory.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No games saved yet. Generate a lineup and click <strong>"Save Game"</strong> to start tracking.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {gameHistory.map((game) => (
                <div
                  key={game.id}
                  className="game-history-item p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground game-name">{game.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {game.formation || '2-3-1'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {formatDisplayDate(game.date)}
                      </span>
                      {game.notes && (
                        <span className="game-notes italic max-w-[200px] truncate">
                          {game.notes}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-action="view-game"
                      onClick={() => onViewGame && onViewGame(game)}
                      className="h-8 px-2.5 text-xs flex items-center gap-1 btn-view-game"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-action="notes-game"
                      onClick={() => onOpenNotes(game)}
                      className="h-8 px-2.5 text-xs flex items-center gap-1 btn-notes-game"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Notes
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-action="delete-game"
                      onClick={() => onDeleteGame(game.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 btn-delete-game"
                      title="Delete game"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Player Development & Position Heatmap */}
      <PlayerHeatmapCard
        players={players}
        stats={stats}
        gameHistory={gameHistory}
      />

      {/* Player Statistics Table */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-semibold">Player Statistics</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {Object.keys(stats).length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Save some games to see player statistics across the season.
            </div>
          ) : (
            <div className="overflow-x-auto" id="playerStatsTable">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Player</TableHead>
                    <TableHead className="text-center">Games</TableHead>
                    <TableHead className="text-center">Quarters</TableHead>
                    <TableHead className="text-center">GK</TableHead>
                    <TableHead className="text-center">Defense</TableHead>
                    <TableHead className="text-center">Midfield</TableHead>
                    <TableHead className="text-center">Offense</TableHead>
                    <TableHead className="text-center">Sit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(stats).map(([playerName, playerStat]) => (
                    <TableRow key={playerName}>
                      <TableCell className="font-medium text-xs">
                        {playerName}
                      </TableCell>
                      <TableCell className="text-center text-xs">{playerStat.gamesPlayed || 0}</TableCell>
                      <TableCell className="text-center text-xs font-semibold text-primary">
                        {playerStat.quartersPlayed || 0}
                      </TableCell>
                      <TableCell className="text-center text-xs text-amber-500 font-medium">
                        {playerStat.keeperQuarters || 0}
                      </TableCell>
                      <TableCell className="text-center text-xs">{playerStat.defenseQuarters || 0}</TableCell>
                      <TableCell className="text-center text-xs">{playerStat.midfieldQuarters || 0}</TableCell>
                      <TableCell className="text-center text-xs">{playerStat.offenseQuarters || 0}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {playerStat.sittingQuarters || 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Season Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          id="exportSeasonStats"
          onClick={onExportStats}
          disabled={gameHistory.length === 0}
          className="flex items-center gap-1.5 text-xs"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Export Stats (CSV)
        </Button>

        {gameHistory.length > 0 && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            id="clearSeasonHistory"
            onClick={onClearHistory}
            className="flex items-center gap-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All History
          </Button>
        )}
      </div>
    </div>
  );
}
