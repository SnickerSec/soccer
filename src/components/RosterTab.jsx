import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Download,
  Trash2,
  Plus,
  Sparkles,
  X,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RatingDialog } from './RatingDialog';

export function RosterTab({
  players = [],
  captains = [],
  onAddPlayer,
  onRemovePlayer,
  onUpdatePlayer,
  onRenamePlayer,
  onToggleCaptain,
  onImportFile,
  onExportRoster,
  onClearAll,
  onLoadDemo,
}) {
  const fileInputRef = useRef(null);
  const [nameInput, setNameInput] = useState('');
  const [numberInput, setNumberInput] = useState('');
  const [ratingPlayer, setRatingPlayer] = useState(null);
  const [renamingPlayer, setRenamingPlayer] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  // Escape has to tell the blur that follows it not to save. Both fire, and a
  // state flag set by the keydown is not visible to the blur handler's closure.
  const cancelRenameRef = useRef(false);

  const startRename = (player) => {
    setRenamingPlayer(player.name);
    setRenameInput(player.name);
  };

  const finishRename = () => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setRenamingPlayer(null);
      return;
    }
    const next = renameInput.trim();
    if (renamingPlayer && next && next !== renamingPlayer) {
      onRenamePlayer?.(renamingPlayer, next);
    }
    setRenamingPlayer(null);
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    onAddPlayer({
      name: nameInput.trim(),
      number: numberInput ? parseInt(numberInput, 10) : undefined,
    });
    setNameInput('');
    setNumberInput('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Import & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,.tsv,.txt,.json"
            className="hidden"
            id="fileInput"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs"
            id="importRosterButton"
          >
            <Upload className="h-3.5 w-3.5" />
            Import Roster (.csv / .txt / .json)
          </Button>

          {players.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportRoster}
              id="exportPlayers"
              className="flex items-center gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Export Players
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onLoadDemo}
            id="demoButton"
            className="flex items-center gap-1.5 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Load Demo
          </Button>
        </div>

        {players.length > 0 && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onClearAll}
            id="clearAll"
            className="flex items-center gap-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All
          </Button>
        )}
      </div>

      {/* Manual Player Input */}
      <div className="p-4 rounded-lg border bg-card shadow-sm space-y-3">
        <h3 className="text-sm font-semibold tracking-tight">Add Player Manually</h3>
        <form onSubmit={handleAddSubmit} className="flex flex-wrap sm:flex-nowrap gap-2">
          <Input
            type="text"
            placeholder="Enter player name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="flex-1 h-9 text-xs"
            id="playerName"
            aria-label="Enter player name"
          />
          <Input
            type="number"
            placeholder="#"
            min="1"
            max="99"
            value={numberInput}
            onChange={(e) => setNumberInput(e.target.value)}
            className="w-16 h-9 text-xs"
            id="playerNumber"
            aria-label="Enter player number"
          />
          <Button
            type="submit"
            size="sm"
            id="addPlayer"
            className="flex items-center gap-1 text-xs shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Player
          </Button>
        </form>
      </div>

        {/* Roster Table Card */}
        <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b bg-muted/30">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]" id="presentPlayerCount">
                {players.filter((p) => !p.status || p.status === 'available').length} Present
              </span>
              {players.some((p) => p.status === 'absent' || p.status === 'injured') && (
                <>
                  <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold text-[11px]" id="absentPlayerCount">
                    {players.filter((p) => p.status === 'absent' || p.status === 'injured').length} Absent
                  </span>
                  <button
                    type="button"
                    id="markAllAvailable"
                    onClick={() => {
                      players.forEach((p) => onUpdatePlayer(p.name, { status: 'available' }));
                    }}
                    className="text-[11px] font-semibold text-primary hover:underline ml-1 cursor-pointer"
                  >
                    Mark All Available
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">⭐ Captain</span>
              <span className="flex items-center gap-1">
                <Badge variant="secondary" className="px-1 py-0 text-[10px] font-bold">GK</Badge> No GK
              </span>
              <span className="flex items-center gap-1">
                <Badge variant="secondary" className="px-1 py-0 text-[10px] font-bold">R</Badge> Must Rest
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-success" /> Status
              </span>
            </div>
          </div>

        {/* Players List */}
        {players.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No players added yet. Import a list, add players manually, or click <strong>Load Demo</strong> to get started.
          </div>
        ) : (
          <ul id="playerList" role="list" className="divide-y divide-border">
            {players.map((player, index) => {
              const isCaptain = captains.includes(player.name);
              const status = player.status || 'available';
              const hasRating = player.overallRating != null;

              return (
                <li
                  key={player.id || `${player.name}-${index}`}
                  role="listitem"
                  aria-label={player.name}
                  className={cn(
                    "flex flex-wrap sm:flex-nowrap items-center justify-between p-3 gap-3 transition-colors hover:bg-muted/40",
                    isCaptain && "bg-amber-500/10 dark:bg-amber-400/10 border-l-2 border-l-amber-500 dark:border-l-amber-400",
                    status === 'injured' && "opacity-75 bg-destructive/5",
                    status === 'absent' && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                    {/* Captain Checkbox */}
                    <div className="flex items-center" title="Select as captain (max 2)">
                      <input
                        type="checkbox"
                        checked={isCaptain}
                        data-player={player.name}
                        onChange={() => onToggleCaptain(player.name)}
                        aria-label={`Select ${player.name} as captain`}
                        className="captain-checkbox h-4 w-4 rounded border-primary text-primary focus:ring-primary cursor-pointer accent-primary"
                      />
                    </div>

                    {/* Jersey Number */}
                    <Input
                      type="number"
                      min="1"
                      max="99"
                      value={player.number ?? ''}
                      placeholder="#"
                      data-index={String(index)}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        onUpdatePlayer(player.name, { number: val });
                      }}
                      className="player-number-edit w-12 h-8 text-xs text-center p-1"
                      aria-label={`Jersey number for ${player.name}`}
                    />

                    {/* Name Display */}
                    <div className="flex items-center gap-1.5 flex-1 truncate">
                      {renamingPlayer === player.name ? (
                        <Input
                          autoFocus
                          value={renameInput}
                          maxLength={255}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelRenameRef.current = true;
                              e.currentTarget.blur();
                            }
                          }}
                          onBlur={finishRename}
                          aria-label={`New name for ${player.name}`}
                          className="player-name-edit h-8 text-sm flex-1 min-w-0"
                        />
                      ) : (
                        <>
                          {isCaptain && (
                            <span className="captain-star text-amber-500 dark:text-amber-400 shrink-0 text-base" title="Team Captain">⭐</span>
                          )}
                          <span className={cn(
                            "text-sm font-medium text-foreground truncate",
                            isCaptain && "font-semibold text-amber-600 dark:text-amber-300"
                          )}>
                            {player.name}
                          </span>
                          {/* Always visible rather than revealed on hover: half
                              of this app is used on a phone at the touchline. */}
                          <button
                            type="button"
                            data-player={player.name}
                            onClick={() => startRename(player)}
                            aria-label={`Rename ${player.name}`}
                            title="Rename player"
                            className="player-rename shrink-0 p-1 rounded text-muted-foreground/70 hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Preferences & Status */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* No Keeper Toggle */}
                    <Button
                      type="button"
                      variant={player.noKeeper ? "default" : "outline"}
                      size="sm"
                      data-pref="noKeeper"
                      data-player={player.name}
                      aria-pressed={player.noKeeper ? 'true' : 'false'}
                      onClick={() => onUpdatePlayer(player.name, { noKeeper: !player.noKeeper })}
                      className={cn(
                        "no-keeper h-8 px-2 text-xs font-bold",
                        player.noKeeper && "active bg-amber-600 hover:bg-amber-700 text-white"
                      )}
                      title={player.noKeeper ? "Will NOT play goalkeeper" : "Can play goalkeeper"}
                    >
                      GK
                    </Button>

                    {/* Must Rest Toggle */}
                    <Button
                      type="button"
                      variant={player.mustRest ? "default" : "outline"}
                      size="sm"
                      data-pref="mustRest"
                      data-player={player.name}
                      aria-pressed={player.mustRest ? 'true' : 'false'}
                      onClick={() => onUpdatePlayer(player.name, { mustRest: !player.mustRest })}
                      className={cn(
                        "must-rest h-8 px-2 text-xs font-bold",
                        player.mustRest && "active bg-blue-600 hover:bg-blue-700 text-white"
                      )}
                      title={player.mustRest ? "Must rest at least 1 quarter" : "Normal rotation"}
                    >
                      R
                    </Button>

                    {/* Rating Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-pref="rating"
                      data-player={player.name}
                      aria-haspopup="dialog"
                      onClick={() => setRatingPlayer(player)}
                      className={cn(
                        "player-rating-btn h-8 px-2 text-xs flex items-center gap-1 font-semibold",
                        hasRating ? "text-captain border-captain/50" : "text-muted-foreground"
                      )}
                      title={hasRating ? `Rating: ${player.overallRating}/5 (click to edit)` : "Set player ratings"}
                    >
                      {hasRating ? String(player.overallRating) : '–'}
                    </Button>

                    {/* Availability Status Select */}
                    <select
                      data-player={player.name}
                      value={status}
                      onChange={(e) => onUpdatePlayer(player.name, { status: e.target.value })}
                      className={cn(
                        "player-status-select flex h-8 w-28 rounded-md border border-input bg-card px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer text-foreground",
                        `status-${status}`
                      )}
                      aria-label={`Status for ${player.name}`}
                    >
                      <option value="available">Available</option>
                      <option value="injured">Injured</option>
                      <option value="absent">Absent</option>
                    </select>

                    {/* Remove Player */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-player={player.name}
                      onClick={() => onRemovePlayer(player.name)}
                      className="remove-btn h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Remove player"
                      aria-label={`Remove ${player.name} from roster`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Rating Dialog */}
      <RatingDialog
        isOpen={Boolean(ratingPlayer)}
        player={ratingPlayer}
        onClose={() => setRatingPlayer(null)}
        onSave={(updatedRatings) => {
          if (ratingPlayer) {
            onUpdatePlayer(ratingPlayer.name, updatedRatings);
          }
        }}
      />
    </div>
  );
}
