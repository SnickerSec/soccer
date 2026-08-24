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
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Sparkles,
  Shield,
  Zap,
  Target,
  Trash2,
  Check,
  Plus,
} from 'lucide-react';
import {
  getCustomFormations,
  saveCustomFormation,
  deleteCustomFormation,
} from '@/modules/formations';
import { FieldVisualization } from './FieldVisualization';
import { toast } from 'sonner';

const AVAILABLE_POSITIONS = {
  defensive: [
    'Left Back',
    'Center Back',
    'Right Back',
    'Left Center Back',
    'Right Center Back',
    'Left Wing Back',
    'Right Wing Back',
  ],
  midfield: [
    'Center Mid',
    'Left Mid',
    'Right Mid',
    'Left Center Mid',
    'Right Center Mid',
    'Left Defensive Mid',
    'Right Defensive Mid',
    'Attacking Mid',
  ],
  offensive: [
    'Striker',
    'Left Wing',
    'Right Wing',
    'Left Striker',
    'Right Striker',
    'Left Forward',
    'Right Forward',
  ],
};

export function CustomFormationModal({
  isOpen,
  onClose,
  initialFieldSize = 7,
  onFormationCreated,
}) {
  const [fieldSize, setFieldSize] = useState(initialFieldSize);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPositions, setSelectedPositions] = useState(['Keeper', 'Left Back', 'Right Back', 'Center Mid', 'Striker', 'Left Wing', 'Right Wing']);
  const [customList, setCustomList] = useState(() => getCustomFormations());

  // Refresh list on open
  React.useEffect(() => {
    if (isOpen) {
      setCustomList(getCustomFormations());
      setFieldSize(initialFieldSize);
    }
  }, [isOpen, initialFieldSize]);

  if (!isOpen) return null;

  const currentCount = selectedPositions.length;
  const isComplete = currentCount === Number(fieldSize);

  const togglePosition = (posName) => {
    if (posName === 'Keeper') return; // Keeper cannot be removed

    if (selectedPositions.includes(posName)) {
      setSelectedPositions(selectedPositions.filter((p) => p !== posName));
    } else {
      if (selectedPositions.length >= Number(fieldSize)) {
        toast.warning(`Field is full (${fieldSize} players max). Remove a position first.`);
        return;
      }
      setSelectedPositions([...selectedPositions, posName]);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Please enter a formation name (e.g. 3-1-2 Diamond)');
      return;
    }
    if (!isComplete) {
      toast.error(`Please select exactly ${fieldSize} positions (currently ${currentCount})`);
      return;
    }

    const saved = saveCustomFormation({
      name: cleanName,
      fieldSize,
      positions: selectedPositions,
      description: description.trim() || `Custom ${cleanName} formation`,
    });

    toast.success(`Custom formation "${cleanName}" created!`);
    setCustomList(getCustomFormations());
    if (onFormationCreated) {
      onFormationCreated(saved.name, fieldSize);
    }
    setName('');
    setDescription('');
    onClose();
  };

  const handleDelete = (formName, fSize) => {
    deleteCustomFormation(formName, fSize);
    setCustomList(getCustomFormations());
    toast.info(`Deleted "${formName}"`);
  };

  // Convert selected positions array into a positions map for the field preview
  const previewPositionsMap = selectedPositions.reduce((acc, pos) => {
    acc[pos] = pos;
    return acc;
  }, {});

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-card text-foreground" id="customFormationModal">
        <DialogHeader className="pb-3 border-b">
          <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Tactical Formation Builder
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Top Form Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="customFormName" className="text-xs text-muted-foreground">
                Formation Name:
              </Label>
              <Input
                id="customFormName"
                placeholder="e.g. 3-1-2-1 Diamond"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-xs h-8"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="customFieldSize" className="text-xs text-muted-foreground">
                Field Size:
              </Label>
              <select
                id="customFieldSize"
                value={fieldSize}
                onChange={(e) => {
                  const sz = parseInt(e.target.value, 10);
                  setFieldSize(sz);
                  // Reset positions to keep Keeper + slice
                  setSelectedPositions(['Keeper']);
                }}
                className="flex h-8 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm text-foreground"
              >
                <option value={5}>5v5 (5 Players)</option>
                <option value={6}>6v6 (6 Players)</option>
                <option value={7}>7v7 (7 Players - 10U)</option>
                <option value={9}>9v9 (9 Players - 12U)</option>
                <option value={11}>11v11 (11 Players - 14U+)</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="customFormDesc" className="text-xs text-muted-foreground">
                Tactical Description:
              </Label>
              <Input
                id="customFormDesc"
                placeholder="e.g. Strong midfield control with solo forward"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-xs h-8"
              />
            </div>
          </div>

          {/* Builder Layout: Position Picker & Live Pitch Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Position Picker */}
            <div className="space-y-3 p-3 rounded-xl border bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Select {fieldSize} Positions</span>
                <Badge
                  variant={isComplete ? 'success' : 'secondary'}
                  className="text-[11px] font-bold"
                >
                  {currentCount} / {fieldSize} Selected
                </Badge>
              </div>

              {/* Keeper (Always selected) */}
              <div className="p-2 rounded-lg border bg-amber-500/10 border-amber-500/30 flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-600 dark:text-amber-300">
                  🧤 Goalkeeper (Required)
                </span>
                <Badge variant="outline" className="text-[10px]">
                  Locked
                </Badge>
              </div>

              {/* Defensive Positions */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-blue-500" /> Defensive Line
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_POSITIONS.defensive.map((pos) => {
                    const isSelected = selectedPositions.includes(pos);
                    return (
                      <Button
                        key={pos}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => togglePosition(pos)}
                        className="h-6 px-2 text-[10px]"
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 mr-1" />}
                        {pos}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Midfield Positions */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> Midfield Line
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_POSITIONS.midfield.map((pos) => {
                    const isSelected = selectedPositions.includes(pos);
                    return (
                      <Button
                        key={pos}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => togglePosition(pos)}
                        className="h-6 px-2 text-[10px]"
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 mr-1" />}
                        {pos}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Attacking Positions */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <Target className="h-3.5 w-3.5 text-red-500" /> Attacking Line
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_POSITIONS.offensive.map((pos) => {
                    const isSelected = selectedPositions.includes(pos);
                    return (
                      <Button
                        key={pos}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => togglePosition(pos)}
                        className="h-6 px-2 text-[10px]"
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 mr-1" />}
                        {pos}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Live Pitch Preview */}
            <div className="space-y-2 flex flex-col items-center">
              <span className="text-xs font-bold text-muted-foreground">
                Tactical Pitch Preview
              </span>
              <FieldVisualization
                quarterNumber={1}
                positions={previewPositionsMap}
                players={[]}
              />
            </div>
          </div>

          {/* Existing Custom Formations List */}
          {customList.length > 0 && (
            <div className="space-y-2 p-3 rounded-xl border bg-muted/10">
              <span className="text-xs font-bold text-muted-foreground">
                Saved Custom Formations ({customList.length})
              </span>
              <div className="space-y-1.5 max-h-28 overflow-y-auto">
                {customList.map((f) => (
                  <div
                    key={`${f.fieldSize}-${f.name}`}
                    className="flex items-center justify-between p-2 rounded-lg border bg-card text-xs"
                  >
                    <div>
                      <span className="font-bold text-foreground">{f.name}</span>
                      <span className="text-muted-foreground ml-2">
                        ({f.fieldSize}v{f.fieldSize} • {f.positions?.join(', ')})
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(f.name, f.fieldSize)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="Delete formation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t flex flex-row items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!name.trim() || !isComplete}
            id="saveCustomFormation"
            className="text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Save & Apply Formation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
