import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function GameNotesModal({ isOpen, game, onClose, onSaveNotes }) {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (game) {
      setNotes(game.notes || '');
    }
  }, [game]);

  if (!isOpen || !game) return null;

  const handleSave = (e) => {
    e.preventDefault();
    onSaveNotes(game.id, notes.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in-0">
      <dialog
        open
        id="notesModal"
        className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-lg text-card-foreground m-0 block"
      >
        <div className="flex flex-col space-y-1.5 text-center sm:text-left mb-4">
          <h2 className="text-lg font-semibold leading-none tracking-tight">Game Notes</h2>
          <p className="text-xs text-muted-foreground">
            Add or edit private notes for this match
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gameNotesInput" className="text-xs text-muted-foreground block">
              Notes for <strong className="text-foreground font-semibold" id="notesGameName">{game.name}</strong>:
            </Label>
            <Textarea
              id="gameNotesInput"
              rows={4}
              maxLength={500}
              placeholder="e.g., Won 3-1, great passing in second half, player milestones..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm w-full"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              id="cancelGameNotes"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              id="confirmGameNotes"
              className="text-xs"
            >
              Save Notes
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
