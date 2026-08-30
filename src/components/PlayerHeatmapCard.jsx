import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Award,
  Sparkles,
  Shield,
  Zap,
  Target,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function PlayerHeatmapCard({ players = [], stats = {}, gameHistory = [] }) {
  const playerNames = Object.keys(stats).length > 0
    ? Object.keys(stats)
    : players.map((p) => p.name);

  const [selectedPlayer, setSelectedPlayer] = useState(playerNames[0] || null);

  // Sync selected player if playerNames changes
  React.useEffect(() => {
    if (playerNames.length > 0 && (!selectedPlayer || !playerNames.includes(selectedPlayer))) {
      setSelectedPlayer(playerNames[0]);
    }
  }, [playerNames, selectedPlayer]);

  if (!selectedPlayer || playerNames.length === 0) return null;

  const pStat = stats[selectedPlayer] || {
    gamesPlayed: 0,
    quartersPlayed: 0,
    keeperQuarters: 0,
    defenseQuarters: 0,
    midfieldQuarters: 0,
    offenseQuarters: 0,
    sittingQuarters: 0,
    captainGames: 0,
  };

  const totalPlayed = pStat.quartersPlayed || 0;
  const gkPct = totalPlayed > 0 ? Math.round((pStat.keeperQuarters / totalPlayed) * 100) : 0;
  const defPct = totalPlayed > 0 ? Math.round((pStat.defenseQuarters / totalPlayed) * 100) : 0;
  const midPct = totalPlayed > 0 ? Math.round((pStat.midfieldQuarters / totalPlayed) * 100) : 0;
  const offPct = totalPlayed > 0 ? Math.round((pStat.offenseQuarters / totalPlayed) * 100) : 0;

  // Calculate Balance Rating & Coaching Insight
  const getBalanceInfo = () => {
    if (totalPlayed === 0) {
      return {
        score: 'New Player',
        status: 'default',
        tip: 'Save upcoming game records to start mapping position history and development.',
      };
    }

    const zonesPlayed = [pStat.keeperQuarters, pStat.defenseQuarters, pStat.midfieldQuarters, pStat.offenseQuarters].filter(
      (q) => q > 0
    ).length;

    if (zonesPlayed >= 3) {
      return {
        score: 'Well-Rounded (95%)',
        status: 'success',
        tip: `${selectedPlayer} is gaining broad experience across multiple pitch zones in line with AYSO fair development.`,
      };
    }

    // In 2-line direct formations (e.g. 3-3 with backs and forwards, no midfield)
    const isBothEnds = pStat.defenseQuarters > 0 && pStat.offenseQuarters > 0;
    const imbalance = Math.abs(defPct - offPct);

    if (isBothEnds && imbalance <= 30) {
      return {
        score: 'Well-Balanced (95%)',
        status: 'success',
        tip: `${selectedPlayer} has an even balance between defense (${defPct}%) and attack (${offPct}%) across games.`,
      };
    }

    if (defPct >= 65) {
      return {
        score: 'Defense Heavy',
        status: 'warning',
        tip: `${selectedPlayer} has spent ${defPct}% of their time in defense. Consider giving them forward or midfield minutes.`,
      };
    }

    if (offPct >= 65) {
      return {
        score: 'Attack Heavy',
        status: 'warning',
        tip: `${selectedPlayer} has spent ${offPct}% of their time in offense. Consider giving them defensive or midfield rotation.`,
      };
    }

    return {
      score: 'Developing (75%)',
      status: 'default',
      tip: `${selectedPlayer} is developing steadily across positions.`,
    };
  };

  const balance = getBalanceInfo();

  // Color intensity helpers based on quarter counts
  const getZoneColor = (count, max) => {
    if (count === 0) return 'bg-muted/15 border-border/40 text-muted-foreground/50';
    if (count >= 5) return 'bg-amber-500/25 border-amber-500 text-amber-600 dark:text-amber-300 font-bold';
    if (count >= 3) return 'bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-300 font-semibold';
    return 'bg-primary/15 border-primary/60 text-primary font-medium';
  };

  return (
    <Card className="shadow-sm overflow-hidden border bg-card" id="playerDevelopmentHeatmap">
      <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold tracking-tight">
            Player Development & Position Heatmap
          </CardTitle>
        </div>

        {/* Player Selector Dropdown / Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
          {playerNames.map((name) => (
            <Button
              key={name}
              type="button"
              variant={selectedPlayer === name ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPlayer(name)}
              className="h-7 px-2.5 text-xs whitespace-nowrap cursor-pointer"
            >
              {name}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Top Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border bg-muted/20 text-center">
            <span className="text-[11px] font-medium text-muted-foreground block">Games Played</span>
            <span className="text-xl font-bold text-foreground">{pStat.gamesPlayed || 0}</span>
          </div>

          <div className="p-3 rounded-lg border bg-muted/20 text-center">
            <span className="text-[11px] font-medium text-muted-foreground block">Quarters Played</span>
            <span className="text-xl font-bold text-primary">{pStat.quartersPlayed || 0}</span>
          </div>

          <div className="p-3 rounded-lg border bg-muted/20 text-center">
            <span className="text-[11px] font-medium text-muted-foreground block">Captain Matches</span>
            <span className="text-xl font-bold text-amber-500 flex items-center justify-center gap-1">
              ⭐ {pStat.captainGames || 0}
            </span>
          </div>

          <div className="p-3 rounded-lg border bg-muted/20 text-center">
            <span className="text-[11px] font-medium text-muted-foreground block">Rotation Balance</span>
            <Badge
              variant={balance.status === 'success' ? 'success' : balance.status === 'warning' ? 'warning' : 'secondary'}
              className="mt-1 text-[10px] font-bold"
            >
              {balance.score}
            </Badge>
          </div>
        </div>

        {/* Heatmap Pitch & Zone Distribution */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Visual Soccer Pitch Heatmap (2 cols on desktop) */}
          <div className="md:col-span-2 rounded-xl border border-emerald-900/30 bg-emerald-950/40 dark:bg-emerald-950/60 p-3 relative overflow-hidden">
            {/* Pitch Markings Overlay */}
            <div className="absolute inset-2 border-2 border-white/20 rounded-lg pointer-events-none flex flex-col justify-between">
              {/* Half-way line */}
              <div className="w-full h-0.5 bg-white/20 my-auto" />
              {/* Center Circle */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white/20 pointer-events-none" />
            </div>

            {/* 4 Heatmap Zones (Top to Bottom: Forward -> Midfield -> Defense -> Keeper) */}
            <div className="relative z-10 space-y-2 py-1">
              {/* Forward / Offense Zone */}
              <div
                className={cn(
                  "p-2.5 rounded-lg border flex items-center justify-between transition-all backdrop-blur-sm",
                  getZoneColor(pStat.offenseQuarters)
                )}
              >
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  <span className="text-xs font-bold">Forward & Attack Zone</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black">{pStat.offenseQuarters || 0} Qtrs</span>
                  <span className="text-[10px] block opacity-80">({offPct}%)</span>
                </div>
              </div>

              {/* Midfield Zone */}
              <div
                className={cn(
                  "p-2.5 rounded-lg border flex items-center justify-between transition-all backdrop-blur-sm",
                  getZoneColor(pStat.midfieldQuarters)
                )}
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-bold">Midfield Zone</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black">{pStat.midfieldQuarters || 0} Qtrs</span>
                  <span className="text-[10px] block opacity-80">({midPct}%)</span>
                </div>
              </div>

              {/* Defensive Zone */}
              <div
                className={cn(
                  "p-2.5 rounded-lg border flex items-center justify-between transition-all backdrop-blur-sm",
                  getZoneColor(pStat.defenseQuarters)
                )}
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span className="text-xs font-bold">Defense Zone</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black">{pStat.defenseQuarters || 0} Qtrs</span>
                  <span className="text-[10px] block opacity-80">({defPct}%)</span>
                </div>
              </div>

              {/* Goalkeeper Zone */}
              <div
                className={cn(
                  "p-2 rounded-lg border flex items-center justify-between transition-all backdrop-blur-sm max-w-[85%] mx-auto",
                  getZoneColor(pStat.keeperQuarters)
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">🧤</span>
                  <span className="text-xs font-bold">Goalkeeper</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black">{pStat.keeperQuarters || 0} Qtrs</span>
                  <span className="text-[10px] block opacity-80">({gkPct}%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Development Breakdown & Tips */}
          <div className="space-y-3">
            {/* Balance Bar */}
            <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Position Distribution</span>
                <span className="text-primary">{totalPlayed} Quarters</span>
              </div>

              <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
                {offPct > 0 && (
                  <div
                    style={{ width: `${offPct}%` }}
                    className="bg-amber-500 h-full"
                    title={`Offense: ${offPct}%`}
                  />
                )}
                {midPct > 0 && (
                  <div
                    style={{ width: `${midPct}%` }}
                    className="bg-blue-500 h-full"
                    title={`Midfield: ${midPct}%`}
                  />
                )}
                {defPct > 0 && (
                  <div
                    style={{ width: `${defPct}%` }}
                    className="bg-emerald-500 h-full"
                    title={`Defense: ${defPct}%`}
                  />
                )}
                {gkPct > 0 && (
                  <div
                    style={{ width: `${gkPct}%` }}
                    className="bg-purple-500 h-full"
                    title={`Keeper: ${gkPct}%`}
                  />
                )}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Offense ({offPct}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Midfield ({midPct}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Defense ({defPct}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-purple-500" /> GK ({gkPct}%)
                </span>
              </div>
            </div>

            {/* AYSO Coaching Tip Card */}
            <div className="p-3 rounded-lg border bg-primary/5 space-y-1">
              <span className="text-xs font-bold text-primary flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Coaching Development Tip
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {balance.tip}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
