import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SaveGameModal({ isOpen, onClose, onSave }) {
  const [gameName, setGameName] = useState('');
  const [gameDate, setGameDate] = useState(() => new Date().toISOString().split('T')[0]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!gameName.trim()) return;
    onSave({
      name: gameName.trim(),
      date: gameDate,
    });
    setGameName('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" id="saveGameModal">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Save Game</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="saveGameName" className="text-xs text-muted-foreground">
              Game Name:
            </Label>
            <Input
              type="text"
              id="saveGameName"
              placeholder="e.g., vs Tigers / Game 1"
              maxLength={50}
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              className="text-sm"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="saveGameDate" className="text-xs text-muted-foreground">
              Game Date:
            </Label>
            <Input
              type="date"
              id="saveGameDate"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
              className="text-sm"
              required
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              id="cancelSaveGame"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              id="confirmSaveGame"
              className="text-xs"
            >
              Save Game
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
