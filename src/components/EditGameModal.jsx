import React, { useState, useEffect } from 'react';
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
import { toDateOnly } from '@/modules/schedule';

export function EditGameModal({ isOpen, game, onClose, onSave }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (game && isOpen) {
      setName(game.name || '');
      setDate(game.date ? toDateOnly(game.date) : '');
      setNotes(game.notes || '');
    }
  }, [game, isOpen]);

  if (!isOpen || !game) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave(game.id, {
      name: name.trim(),
      date: date || null,
      notes: notes.trim(),
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" id="editGameModal">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Edit Game</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
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
              rows={4}
              maxLength={500}
              placeholder="e.g., Won 3-1, great passing in second half..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm w-full"
            />
          </div>

          <DialogFooter className="pt-2">
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
            <Button
              type="submit"
              size="sm"
              id="confirmEditGame"
              className="text-xs"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
