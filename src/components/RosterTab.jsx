import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Upload,
  Download,
  Trash2,
  Sparkles,
  Users,
} from 'lucide-react';
import { RosterEditor } from './RosterEditor';

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
  onCreateTeam,
}) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Import & Actions Bar.
          A grid below sm:, not a wrap. Four buttons of four different
          intrinsic widths wrapped into three ragged lines on a phone —
          "Load Demo" and "Clear All" each alone on one. Equal columns fill
          the width and read as a toolbar rather than as leftovers. Above sm:
          it is the wrapping row it always was. */}
      <div className="p-4 rounded-lg border bg-card shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
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
            className="flex w-full items-center justify-center gap-1.5 text-xs sm:w-auto sm:justify-start"
            id="importRosterButton"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            {/* The extension list is what made this button twice the width of
                every other one, and a phone has no file picker where it helps. */}
            <span className="sm:hidden">Import</span>
            <span className="hidden sm:inline">Import Roster (.csv / .txt / .json)</span>
          </Button>

          {players.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportRoster}
              id="exportPlayers"
              className="flex w-full items-center justify-center gap-1.5 text-xs sm:w-auto sm:justify-start"
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
            className="flex w-full items-center justify-center gap-1.5 text-xs sm:w-auto sm:justify-start"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Load Demo
          </Button>

        {players.length > 0 && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onClearAll}
            id="clearAll"
            className="flex w-full items-center justify-center gap-1.5 text-xs sm:w-auto sm:justify-start"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All
          </Button>
        )}
        </div>
      </div>

      <RosterEditor
        players={players}
        captains={captains}
        onAddPlayer={onAddPlayer}
        onRemovePlayer={onRemovePlayer}
        onUpdatePlayer={onUpdatePlayer}
        onRenamePlayer={onRenamePlayer}
        onToggleCaptain={onToggleCaptain}
        headerExtra={
          onCreateTeam && (
            /* Shown signed out as well: a coach who has never signed in is
               exactly who has no team yet, and hiding the button left the
               feature discoverable only from the account menu. Signed out it
               starts the sign-in and opens the dialog on the way back. */
            <Button
              type="button"
              variant="outline"
              size="sm"
              id="createTeamFromRoster"
              onClick={onCreateTeam}
              className="h-6 ml-1 flex items-center gap-1 px-2 text-[11px]"
            >
              <Users className="h-3 w-3" />
              Create Team
            </Button>
          )
        }
      />
    </div>
  );
}
