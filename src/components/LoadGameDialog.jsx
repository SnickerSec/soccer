import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';
import { formatGameDate } from '@/modules/schedule';

/**
 * Picks a game from Game History to put back on the field. Loading goes
 * through the same handler as "Open on the field" in the Season tab, so the
 * screen takes that game's division, field size and formation without
 * changing the team's settings.
 */
export function LoadGameDialog({ isOpen, onClose, gameHistory = [], onLoad }) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" id="loadGameModal">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Load a Saved Game</DialogTitle>
          <DialogDescription className="text-xs">
            Replaces the lineup on screen. Save it first if you want to keep it.
          </DialogDescription>
        </DialogHeader>

        {gameHistory.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No games saved yet.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mx-2 divide-y divide-border">
            {gameHistory.map((game) => (
              <button
                key={game.id}
                type="button"
                data-action="load-game"
                data-game-id={game.id}
                onClick={() => {
                  onLoad(game);
                  onClose();
                }}
                className="w-full text-left px-2 py-2.5 rounded-md hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{game.name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {game.formation || '2-3-1'}
                  </Badge>
                </div>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {formatGameDate(game.date)}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
