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
  CalendarPlus,
  MapPin,
  Clock,
  Shirt,
  Cookie,
  Apple,
  Flag,
  Wrench,
  CheckCircle2,
} from 'lucide-react';
import { formatMatchDate } from '@/modules/schedule';
import { toast } from 'sonner';

export function ScheduleImportModal({
  isOpen,
  onClose,
  parsedData,
  onConfirmImport,
}) {
  const { platform = 'Calendar Schedule', fixtures = [] } = parsedData || {};
  const [selectedIndices, setSelectedIndices] = useState(() =>
    fixtures.map((_, i) => i)
  );
  const [importMode, setImportMode] = useState('merge'); // 'merge' | 'replace'

  React.useEffect(() => {
    if (parsedData && parsedData.fixtures) {
      setSelectedIndices(parsedData.fixtures.map((_, i) => i));
    }
  }, [parsedData]);

  if (!isOpen || !parsedData || fixtures.length === 0) return null;

  const toggleSelectAll = () => {
    if (selectedIndices.length === fixtures.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(fixtures.map((_, i) => i));
    }
  };

  const toggleFixture = (index) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
    }
  };

  const handleConfirm = () => {
    const chosenFixtures = selectedIndices.map((i) => fixtures[i]);
    if (chosenFixtures.length === 0) {
      toast.error('Please select at least one match to import');
      return;
    }

    onConfirmImport(chosenFixtures, importMode);
    toast.success(`Imported ${chosenFixtures.length} matches from ${platform}!`);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6 bg-card text-foreground" id="scheduleImportModal">
        <DialogHeader className="pb-3 border-b flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              Import Schedule Preview
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
              Import Action:
            </span>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scheduleImportMode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  className="accent-primary"
                />
                <span className="font-medium">Merge with current schedule (recommended)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scheduleImportMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="accent-primary"
                />
                <span className="font-medium">Replace existing schedule</span>
              </label>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all-schedule"
                checked={
                  selectedIndices.length === fixtures.length && fixtures.length > 0
                }
                onCheckedChange={toggleSelectAll}
              />
              <label
                htmlFor="select-all-schedule"
                className="text-xs font-semibold cursor-pointer select-none"
              >
                Select All ({selectedIndices.length}/{fixtures.length} matches)
              </label>
            </div>
          </div>

          {/* List of Fixtures */}
          <div className="border rounded-lg divide-y bg-background max-h-80 overflow-y-auto">
            {fixtures.map((fixture, idx) => {
              const isSelected = selectedIndices.includes(idx);
              const formattedDate = formatMatchDate(fixture.gameDate, fixture.gameTime, 'long');

              return (
                <div
                  key={fixture.id || idx}
                  onClick={() => toggleFixture(idx)}
                  className={`p-3 flex items-start gap-3 text-xs cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/5' : 'opacity-60 bg-muted/10'
                  } hover:bg-muted/30`}
                >
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleFixture(idx)}
                    />
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm text-foreground flex items-center gap-2">
                        <span>{fixture.opponent || 'Opponent'}</span>
                        <Badge
                          variant={fixture.homeAway === 'away' ? 'outline' : 'secondary'}
                          className="text-[10px] uppercase font-bold py-0 h-4"
                        >
                          {fixture.homeAway === 'away' ? 'Away' : 'Home'}
                        </Badge>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        Match #{idx + 1}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        {formattedDate}
                      </span>

                      {fixture.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {fixture.location}
                        </span>
                      )}

                      {fixture.jerseyColor && (
                        <span className="flex items-center gap-1">
                          <Shirt className="h-3.5 w-3.5 text-muted-foreground" />
                          {fixture.jerseyColor}
                        </span>
                      )}
                    </div>

                    {/* Volunteers preview if parsed */}
                    {(fixture.snackParent || fixture.fruitParent || fixture.refereeDuty || fixture.fieldSetup) && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {fixture.snackParent && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                            <Cookie className="h-3 w-3" /> Snack: {fixture.snackParent}
                          </span>
                        )}
                        {fixture.fruitParent && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                            <Apple className="h-3 w-3" /> Fruit: {fixture.fruitParent}
                          </span>
                        )}
                        {fixture.refereeDuty && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                            <Flag className="h-3 w-3" /> Ref: {fixture.refereeDuty}
                          </span>
                        )}
                        {fixture.fieldSetup && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">
                            <Wrench className="h-3 w-3" /> Setup: {fixture.fieldSetup}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="pt-3 border-t flex flex-col-reverse sm:flex-row items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={selectedIndices.length === 0}
            className="gap-2 w-full sm:w-auto"
            id="confirmScheduleImportBtn"
          >
            <CheckCircle2 className="h-4 w-4" />
            Import {selectedIndices.length} {selectedIndices.length === 1 ? 'Match' : 'Matches'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
