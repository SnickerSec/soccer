import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  UploadCloud,
  CheckCircle2,
  Users,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

export function RosterImportModal({
  isOpen,
  onClose,
  parsedData,
  onConfirmImport,
}) {
  const { platform = 'CSV Roster', players = [] } = parsedData || {};
  const [selectedIndices, setSelectedIndices] = useState(() =>
    players.map((_, i) => i)
  );
  const [importMode, setImportMode] = useState('replace'); // 'replace' | 'append'

  // Reset selected indices when new parsedData arrives
  React.useEffect(() => {
    if (parsedData && parsedData.players) {
      setSelectedIndices(parsedData.players.map((_, i) => i));
    }
  }, [parsedData]);

  if (!isOpen || !parsedData || players.length === 0) return null;

  const toggleSelectAll = () => {
    if (selectedIndices.length === players.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(players.map((_, i) => i));
    }
  };

  const togglePlayer = (index) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
    }
  };

  const handleConfirm = () => {
    const chosenPlayers = selectedIndices.map((i) => players[i]);
    if (chosenPlayers.length === 0) {
      toast.error('Please select at least one player to import');
      return;
    }

    onConfirmImport(chosenPlayers, importMode);
    toast.success(`Imported ${chosenPlayers.length} players from ${platform}!`);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-4 sm:p-6 bg-card text-foreground" id="rosterImportModal">
        <DialogHeader className="pb-3 border-b flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-primary" />
              Import Roster Preview
            </DialogTitle>
          </div>
          <Badge variant="secondary" className="text-xs font-semibold px-2.5 py-0.5">
            {platform}
          </Badge>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Import Mode Radio selection */}
          <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
            <span className="text-xs font-bold text-foreground block">
              Import Destination:
            </span>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="accent-primary"
                />
                <span>Replace current roster</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="append"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  className="accent-primary"
                />
                <span>Append / Merge with existing roster</span>
              </label>
            </div>
          </div>

          {/* Player Selection List Header */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <Checkbox
                checked={selectedIndices.length === players.length}
                onCheckedChange={toggleSelectAll}
                className="h-4 w-4"
              />
              Select All ({players.length})
            </button>

            <span className="text-xs text-muted-foreground font-medium">
              {selectedIndices.length} of {players.length} players selected
            </span>
          </div>

          {/* Players Table / List */}
          <div className="border rounded-lg divide-y divide-border max-h-64 overflow-y-auto bg-card">
            {players.map((p, idx) => {
              const isChecked = selectedIndices.includes(idx);
              return (
                <div
                  key={idx}
                  onClick={() => togglePlayer(idx)}
                  className={`flex items-center justify-between p-2.5 text-xs cursor-pointer transition-colors ${
                    isChecked ? 'bg-primary/5 hover:bg-primary/10' : 'opacity-60 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => togglePlayer(idx)}
                      className="h-4 w-4"
                    />
                    <span className="font-semibold text-foreground truncate">{p.name}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {p.number != null && (
                      <Badge variant="outline" className="text-[10px] font-bold">
                        #{p.number}
                      </Badge>
                    )}
                    {p.rating != null && (
                      <span className="text-[11px] text-amber-500 font-bold">
                        ⭐ {p.rating}/5
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="pt-3 border-t flex flex-row items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleConfirm}
            disabled={selectedIndices.length === 0}
            id="confirmImportPlayers"
            className="text-xs font-semibold flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Import {selectedIndices.length} Players
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
