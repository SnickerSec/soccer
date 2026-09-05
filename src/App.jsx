import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '@/components/Header';
import { RosterTab } from '@/components/RosterTab';
import { GameSettings } from '@/components/GameSettings';
import { LineupSection } from '@/components/LineupSection';
import { SeasonTab } from '@/components/SeasonTab';
import { ScheduleTab } from '@/components/ScheduleTab';
import { EvaluationTab } from '@/components/EvaluationTab';
import { TeamModal } from '@/components/TeamModal';
import { SaveGameModal } from '@/components/SaveGameModal';
import { GameNotesModal } from '@/components/GameNotesModal';
import { MatchdayDialog } from '@/components/MatchdayDialog';
import { FixtureModal } from '@/components/FixtureModal';
import { CustomFormationModal } from '@/components/CustomFormationModal';
import { RosterImportModal } from '@/components/RosterImportModal';
import { ScheduleImportModal } from '@/components/ScheduleImportModal';
import { InviteModal } from '@/components/InviteModal';
import { ShareLineupDialog } from '@/components/ShareLineupDialog';
import { Footer } from '@/components/Footer';
import { PrintSheet } from '@/components/PrintSheet';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { CONSTANTS } from '@/constants';
import { UndoHistory } from '@/modules/history';
import {
  safeGetFromStorage,
  safeSetToStorage,
  safeParseJSON,
} from '@/modules/storage';
import { shuffleArray } from '@/modules/utils';
import {
  getPositionsForFormation,
  getFormationsForFieldSize,
  formationHasMidfieldLine,
} from '@/modules/formations';
import { generateLineup, validateLineup } from '@/modules/lineup-engine';
import { calculatePlayerStats, currentQuarters, currentPlayerPositions } from '@/modules/season-stats';
import {
  validateRename,
  renameInGames,
  renameInLineup,
} from '@/modules/player-rename';
import {
  initAuth,
  signInWithGoogle,
  signOut,
  getCurrentUser,
  getUserSettings,
  updateUserSettings,
} from '@/modules/auth';
import { useTheme } from '@/contexts/ThemeContext';
import {
  initSync,
  sync,
  pushPlayers,
  pushGame,
  pushGameUpdate,
  pushGameDelete,
  pushFixture,
  pushFixtureUpdate,
  pushFixtureDelete,
  pushSettings,
  getSyncStatus,
  getCurrentTeamId,
  setCurrentTeam,
  SYNC_STATUS,
} from '@/modules/sync';
import {
  getTeams,
  getInviteTokenFromUrl,
  clearInviteTokenFromUrl,
} from '@/modules/team-manager';
import {
  downloadTextFile,
  lineupCsv,
  lineupClipboardText,
  lineupText,
  rosterText,
  seasonStatsCsv,
  exportFilename,
  seasonStatsFilename,
} from '@/modules/export';
import { normalizeSettings, sameSettings } from '@/modules/team-settings';
import { generateMatchCardPdf } from '@/modules/match-card-pdf';
import { extractPlayersFromFile } from '@/modules/roster-importer';
import { extractFixturesFromFile } from '@/modules/schedule-importer';
import { buildShareUrl, decodeShareData } from '@/modules/share-link';
import { toast } from 'sonner';

/**
 * The schedule as localStorage has it.
 *
 * sync() writes the server's copy there, so this is also how a pull reaches
 * the screen: read it again once the sync that ran at sign-in or on a team
 * switch has finished.
 */
function readStoredFixtures() {
  const saved = safeParseJSON(
    safeGetFromStorage(CONSTANTS.STORAGE_KEYS.SCHEDULE),
    []
  );
  return Array.isArray(saved) ? saved : [];
}

/**
 * How the team plays, as localStorage has it — and, since sync() writes the
 * team's copy there, how a pull reaches the screen.
 *
 * Normalized on the way out: what is stored may have been written by another
 * coach's device, and may name a custom formation only they have.
 */
function readStoredSettings() {
  return normalizeSettings(
    safeParseJSON(safeGetFromStorage(CONSTANTS.STORAGE_KEYS.SETTINGS), {})
  );
}

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('roster');

  // Players & Captains
  const [players, setPlayers] = useState(() => {
    const saved = safeParseJSON(
      safeGetFromStorage(CONSTANTS.STORAGE_KEYS.PLAYERS),
      []
    );
    return Array.isArray(saved) ? saved : [];
  });

  const [captains, setCaptains] = useState(() => {
    const saved = safeParseJSON(
      safeGetFromStorage(CONSTANTS.STORAGE_KEYS.PLAYERS),
      []
    );
    return Array.isArray(saved) ? saved.filter((p) => p && p.isCaptain).map((p) => p.name) : [];
  });

  // Settings
  const [settings, setSettings] = useState(readStoredSettings);

  // Lineup
  const [lineup, setLineup] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Game History / Season
  const [gameHistory, setGameHistory] = useState(() => {
    const saved = safeParseJSON(
      safeGetFromStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY),
      []
    );
    return Array.isArray(saved) ? saved : [];
  });

  // Match Schedule Fixtures
  const [fixtures, setFixtures] = useState(readStoredFixtures);

  // Auth & Teams
  const [currentUser, setCurrentUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [currentTeam, setCurrentTeamState] = useState(null);
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.OFFLINE);

  // Modals
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [teamModalInitialTeamId, setTeamModalInitialTeamId] = useState(null);
  const [teamModalInitialView, setTeamModalInitialView] = useState('list');
  const [isSaveGameOpen, setIsSaveGameOpen] = useState(false);
  const [isMatchdayOpen, setIsMatchdayOpen] = useState(false);
  const [isCustomFormationOpen, setIsCustomFormationOpen] = useState(false);
  const [isFixtureModalOpen, setIsFixtureModalOpen] = useState(false);
  const [editingFixture, setEditingFixture] = useState(null);
  const [matchdayFixture, setMatchdayFixture] = useState(null);
  const [rosterImportData, setRosterImportData] = useState(null);
  const [scheduleImportData, setScheduleImportData] = useState(null);
  const [notesModalGame, setNotesModalGame] = useState(null);
  const [inviteToken, setInviteToken] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Undo / Redo History
  const historyRef = useRef(new UndoHistory({ limit: CONSTANTS.MAX_UNDO_STACK_SIZE }));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // State Refs to prevent stale closure timing issues
  const playersRef = useRef(players);
  playersRef.current = players;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const teamsRef = useRef(teams);
  teamsRef.current = teams;
  const currentTeamRef = useRef(currentTeam);
  currentTeamRef.current = currentTeam;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const testAuthUserRef = useRef(null);
  // Renames waiting to be told to the server. Held rather than sent on their
  // own so they travel with the roster push that already carries the new name.
  const pendingRenamesRef = useRef([]);

  // What undo and redo move between. UndoHistory holds the stacks and clones
  // what it is given, so a later edit cannot reach back into a snapshot.
  const snapshot = useCallback(
    () => ({ players, captains, settings }),
    [players, captains, settings]
  );

  const restore = (state) => {
    setPlayers(state.players);
    setCaptains(state.captains);
    setSettings(state.settings);
  };

  const syncHistoryFlags = () => {
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  };

  // Track state for undo
  const saveSnapshot = useCallback(() => {
    historyRef.current.record(snapshot());
    syncHistoryFlags();
  }, [snapshot]);

  const handleUndo = useCallback(() => {
    const previous = historyRef.current.undo(snapshot());
    if (!previous) return;
    restore(previous);
    syncHistoryFlags();
    toast.info('Undo applied');
  }, [snapshot]);

  const handleRedo = useCallback(() => {
    const next = historyRef.current.redo(snapshot());
    if (!next) return;
    restore(next);
    syncHistoryFlags();
    toast.info('Redo applied');
  }, [snapshot]);

  // Persist players to storage & cloud sync
  useEffect(() => {
    safeSetToStorage(
      CONSTANTS.STORAGE_KEYS.PLAYERS,
      JSON.stringify(
        players.map((p) => ({
          ...p,
          isCaptain: captains.includes(p.name),
        }))
      )
    );
    if (currentUser && currentTeam) {
      // Drained here so the rename and the roster that already carries the new
      // name reach the server as one write: it moves the player's saved games
      // in the same transaction that saves the roster. Put back if the write
      // fails, so the next push carries them again rather than leaving the
      // server's history pointing at a name nobody holds.
      const renames = pendingRenamesRef.current;
      pendingRenamesRef.current = [];
      const keepForRetry = () => {
        if (renames.length > 0) {
          pendingRenamesRef.current = [...renames, ...pendingRenamesRef.current];
        }
      };
      pushPlayers(
        players.map((p) => ({
          ...p,
          isCaptain: captains.includes(p.name),
        })),
        { renames }
      )
        .then((result) => {
          if (!result) return;
          if (result.success === false) {
            keepForRetry();
            return;
          }
          // Players another coach edited at the same time, which the merge
          // settled in their favour — including a rename it had to abandon.
          // Saying so is the point of tracking them: an edit that vanishes
          // without a word is the one a coach acts on at the next game.
          if (result.conflicts?.length > 0) {
            toast.warning(
              `Another coach was editing at the same time. Their version won for: ${result.conflicts.join(', ')}.`
            );
          }
        })
        .catch(keepForRetry);
    }
  }, [players, captains, currentUser, currentTeam]);

  // Persist settings
  useEffect(() => {
    safeSetToStorage(CONSTANTS.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  /** Take up what a pull or a team switch left in localStorage. */
  const adoptSettings = useCallback(() => {
    const stored = readStoredSettings();
    settingsRef.current = stored;
    setSettings(stored);
  }, []);

  /**
   * Change how the team plays.
   *
   * Everything that moves the division, the field size or the formation comes
   * through here, so the change reaches the other coaches instead of only this
   * device. It is deliberately not an effect on `settings`: those fire on a
   * pull and on a team switch too, which would push the team its own settings
   * back — or, worse, hand the team being switched to the settings of the one
   * being left.
   *
   * `push: false` is for the caller that is not changing the team at all:
   * reopening a saved game sets the screen up the way that game was played,
   * which is nobody else's business.
   */
  const updateSettings = useCallback((patch, { push = true } = {}) => {
    const previous = settingsRef.current;
    const next = normalizeSettings({ ...previous, ...patch });
    settingsRef.current = next;
    setSettings(next);

    const canWrite = currentTeamRef.current?.role !== 'viewer';
    if (push && canWrite && currentUserRef.current && currentTeamRef.current
        && !sameSettings(previous, next)) {
      pushSettings(next).catch(() => {});
    }
  }, []);

  // Persist game history
  useEffect(() => {
    safeSetToStorage(
      CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY,
      JSON.stringify(gameHistory)
    );
  }, [gameHistory]);

  // Persist schedule fixtures
  useEffect(() => {
    safeSetToStorage(
      CONSTANTS.STORAGE_KEYS.SCHEDULE,
      JSON.stringify(fixtures)
    );
  }, [fixtures]);

  // Check URL for share parameter or invite token on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const lineupParam = urlParams.get('lineup') || urlParams.get('share');
    if (lineupParam) {
      const decoded = decodeShareData(lineupParam);
      if (decoded && decoded.quarters) {
        if (decoded.players && decoded.players.length > 0) {
          setPlayers(decoded.players);
        }
        if (decoded.captains) {
          setCaptains(decoded.captains);
        }
        if (decoded.formation || decoded.fieldPlayers) {
          const newSettings = {
            ...settingsRef.current,
            formation: decoded.formation || settingsRef.current.formation,
            fieldPlayers: decoded.fieldPlayers || settingsRef.current.fieldPlayers,
          };
          settingsRef.current = newSettings;
          setSettings(newSettings);
        }
        setLineup({
          quarters: decoded.quarters,
          formation: decoded.formation || settingsRef.current.formation,
          fieldPlayers: decoded.fieldPlayers || settingsRef.current.fieldPlayers,
          warnings: [],
          playerStats: decoded.players || playersRef.current,
          generatedAt: Date.now(),
        });
        toast.info('Loaded shared game lineup');
      }
    }

    const token = getInviteTokenFromUrl();
    if (token) {
      setInviteToken(token);
    }
  }, []);

  // Initialize Auth & Sync
  const refreshTeams = useCallback(async () => {
    try {
      const res = await getTeams();
      if (res.success && res.data) {
        setTeams(res.data);
        const teamId = getCurrentTeamId();
        const active = res.data.find((t) => t.id === teamId) || res.data[0];
        setCurrentTeamState(active || null);
      }
    } catch (e) {
      console.error('Failed to load teams:', e);
    }
  }, []);

  // The coach's theme, which user_settings has held all along and nothing ever
  // read back. It is adopted only on a device with no preference of its own —
  // a phone being signed into for the first time — and pushed whenever it
  // changes after that, so the next new device starts where this one left off.
  const { theme, setTheme, hasStoredPreference } = useTheme();
  const themeAdoptedRef = useRef(false);
  const syncedThemeRef = useRef(null);

  const adoptRemoteTheme = useCallback(async () => {
    const remote = await getUserSettings();
    // What the server already holds, so the push below does not send it
    // straight back on every sign-in.
    syncedThemeRef.current = remote?.theme || null;
    if (!hasStoredPreference && (remote?.theme === 'dark' || remote?.theme === 'light')) {
      setTheme(remote.theme);
    }
    themeAdoptedRef.current = true;
  }, [hasStoredPreference, setTheme]);

  useEffect(() => {
    // Not before the adoption has run, or the dark this device defaults to
    // would overwrite the light the coach chose on the other one.
    if (!currentUser || !themeAdoptedRef.current) return;
    if (syncedThemeRef.current === theme) return;
    syncedThemeRef.current = theme;
    updateUserSettings({ theme }).catch(() => {});
  }, [theme, currentUser]);

  useEffect(() => {
    const setupAuth = async () => {
      try {
        const user = await initAuth((event, u) => {
          if (!testAuthUserRef.current) {
            setCurrentUser(u);
          }
        });
        if (!testAuthUserRef.current && user) {
          setCurrentUser(user);
          await initSync((status, meta) => {
            setSyncStatus(status);
            // A pull — from the online handler as much as from startup — has
            // just replaced the stored schedule with the server's.
            if (meta?.pulled) {
              setFixtures(readStoredFixtures());
              adoptSettings();
            }
          });
          // initSync drains the queue and pulls; the schedule and the
          // settings it wrote are newer than the ones this component read when
          // it mounted.
          setFixtures(readStoredFixtures());
          adoptSettings();
          await refreshTeams();
          await adoptRemoteTheme();
        }
      } catch (err) {
        console.error('Auth/Sync init error:', err);
      }
    };
    setupAuth();
  }, [refreshTeams, adoptSettings, adoptRemoteTheme]);

  // Expose lineupGenerator on window for tests and integration
  useEffect(() => {
    window.lineupGenerator = {
      get currentUser() {
        return currentUser;
      },
      set currentUser(user) {
        testAuthUserRef.current = user;
        setCurrentUser(user);
      },
      get teams() {
        return teamsRef.current;
      },
      set teams(newTeams) {
        teamsRef.current = newTeams || [];
        setTeams(newTeams || []);
      },
      get currentTeamId() {
        return currentTeamRef.current?.id;
      },
      set currentTeamId(id) {
        const list = teamsRef.current || [];
        const found = list.find((t) => t.id === id) || (id ? { id } : null);
        currentTeamRef.current = found;
        setCurrentTeamState(found);
      },
      updateAuthUI: (user) => {
        testAuthUserRef.current = user;
        setCurrentUser(user);
        const userMenu = document.getElementById('userMenu');
        const authSignedOut = document.getElementById('authSignedOut');
        if (user) {
          if (userMenu) userMenu.classList.remove('hidden');
          if (authSignedOut) authSignedOut.classList.add('hidden');
          const nameEl = document.getElementById('accountName');
          if (nameEl) nameEl.textContent = user.displayName || 'Coach';
          const emailEl = document.getElementById('accountEmail');
          if (emailEl) emailEl.textContent = user.email || '';
        } else {
          if (userMenu) userMenu.classList.add('hidden');
          if (authSignedOut) authSignedOut.classList.remove('hidden');
          const panel = document.getElementById('accountPanel');
          if (panel) panel.classList.add('hidden');
        }
        if (window.__authCallback) window.__authCallback(user);
      },
      updateTeamSelector: () => {},
      updateSyncStatusUI: (status) => {
        const norm = ['syncing', 'synced', 'error', 'offline'].includes(status) ? status : 'offline';
        setSyncStatus(norm);
        const el = document.getElementById('syncStatus');
        if (el) {
          el.className = `sync-status flex items-center gap-1.5 text-xs ${norm}`;
          const textEl = el.querySelector('.sync-text');
          if (textEl) {
            textEl.textContent =
              norm === 'syncing'
                ? 'Syncing...'
                : norm === 'synced'
                ? 'Synced'
                : norm === 'error'
                ? 'Sync Error'
                : 'Offline';
          }
          const useEl = el.querySelector('.sync-icon use');
          if (useEl) {
            useEl.setAttribute('href', `/assets/icons.svg#icon-sync-${norm}`);
          }
        }
      },
      switchTeam: (teamId) => {
        if (window.__switched) window.__switched.push(teamId);
        handleSelectTeam(teamId);
      },
      showTeamModal: () => {
        setIsTeamModalOpen(true);
      },
      showTeamDetails: async (teamId) => {
        setTeamModalInitialTeamId(teamId);
        setIsTeamModalOpen(true);
      },
    };
  }, [currentUser, currentTeam, teams, syncStatus]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger when typing in input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        handleGenerateLineup();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Team Selection
  const handleSelectTeam = async (teamId) => {
    setCurrentTeam(teamId);
    const selected = teams.find((t) => t.id === teamId);
    setCurrentTeamState(selected || null);
    await sync();
    // Reload local data
    const localPlayers = safeParseJSON(
      safeGetFromStorage(CONSTANTS.STORAGE_KEYS.PLAYERS),
      []
    );
    setPlayers(localPlayers);
    setCaptains(localPlayers.filter((p) => p.isCaptain).map((p) => p.name));
    const localHistory = safeParseJSON(
      safeGetFromStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY),
      []
    );
    setGameHistory(localHistory);
    // sync() has already pulled this team's schedule into localStorage. The
    // fetch that used to live here adopted the cloud list only when it had at
    // least one match in it, so a team whose last match another coach deleted
    // kept showing the one this device remembered.
    setFixtures(readStoredFixtures());
    // Each team keeps its own division, field size and formation, so the
    // switch brings this one's rather than leaving the last one's on screen.
    adoptSettings();
    toast.success(`Switched to ${selected?.name || 'team'}`);
  };

  // Player handlers
  const handleAddPlayer = ({ name, number }) => {
    if (players.length >= CONSTANTS.MAX_PLAYERS) {
      toast.error(`Maximum of ${CONSTANTS.MAX_PLAYERS} players allowed`);
      return;
    }
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`Player with name "${name}" already exists`);
      return;
    }

    saveSnapshot();
    setPlayers((prev) => [
      ...prev,
      {
        id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name,
        number,
        status: 'available',
        noKeeper: false,
        mustRest: false,
        overallRating: null,
        positionalRatings: {},
      },
    ]);
    toast.success(`Added ${name}`);
  };

  const handleRemovePlayer = (name) => {
    saveSnapshot();
    setPlayers((prev) => prev.filter((p) => p.name !== name));
    setCaptains((prev) => prev.filter((c) => c !== name));
    toast.info(`Removed ${name}`);
  };

  const handleUpdatePlayer = (indexOrName, fieldsOrPlayer) => {
    saveSnapshot();
    setPlayers((prev) => {
      let updated;
      if (typeof indexOrName === 'number') {
        updated = prev.map((p, i) => (i === indexOrName ? { ...p, ...fieldsOrPlayer } : p));
      } else {
        updated = prev.map((p) => (p.name === indexOrName ? { ...p, ...fieldsOrPlayer } : p));
      }
      safeSetToStorage(CONSTANTS.STORAGE_KEYS.PLAYERS, JSON.stringify(updated));
      return updated;
    });
  };

  /**
   * Renames a player and moves their season history with them.
   *
   * A player is identified by name throughout — season stats key on it, and a
   * saved game records it rather than an id — so the name is rewritten across
   * the saved games, the current lineup and the captain list together. Leaving
   * any of them behind would split one player into two: the renamed one with
   * no history, and an orphan holding all of it.
   *
   * Deliberately not added to the undo stack. Undo restores players, captains
   * and settings but not the game history, so undoing a rename would put the
   * old name back on the roster while the games kept the new one — the very
   * split this avoids. Renaming back is the exact inverse and costs a tap.
   */
  const handleRenamePlayer = (from, newName) => {
    const to = (newName || '').trim();
    if (to === from) return;

    const error = validateRename(players, from, to);
    if (error) {
      toast.error(error);
      return;
    }

    setPlayers((prev) => prev.map((p) => (p.name === from ? { ...p, name: to } : p)));
    setCaptains((prev) => prev.map((c) => (c === from ? to : c)));
    setGameHistory((prev) => renameInGames(prev, from, to));
    setLineup((prev) => renameInLineup(prev, from, to));

    pendingRenamesRef.current.push({ from, to });
    toast.success(`Renamed ${from} to ${to}`);
  };

  const handleToggleMustRest = (name) => {
    saveSnapshot();
    let updated;
    setPlayers((prev) => {
      updated = prev.map((p) => (p.name === name ? { ...p, mustRest: !p.mustRest } : p));
      safeSetToStorage(CONSTANTS.STORAGE_KEYS.PLAYERS, JSON.stringify(updated));
      return updated;
    });
    setLineup((prev) => {
      if (!prev || !prev.playerStats) return prev;
      return {
        ...prev,
        playerStats: prev.playerStats.map((p) =>
          p.name === name ? { ...p, mustRest: !p.mustRest } : p
        ),
      };
    });
  };

  const handleToggleNoKeeper = (name) => {
    saveSnapshot();
    let updated;
    setPlayers((prev) => {
      updated = prev.map((p) => (p.name === name ? { ...p, noKeeper: !p.noKeeper } : p));
      safeSetToStorage(CONSTANTS.STORAGE_KEYS.PLAYERS, JSON.stringify(updated));
      return updated;
    });
    setLineup((prev) => {
      if (!prev || !prev.playerStats) return prev;
      return {
        ...prev,
        playerStats: prev.playerStats.map((p) =>
          p.name === name ? { ...p, noKeeper: !p.noKeeper } : p
        ),
      };
    });
  };

  const handleToggleCaptain = (name) => {
    saveSnapshot();
    setCaptains((prev) => {
      if (prev.includes(name)) {
        return prev.filter((c) => c !== name);
      }
      if (prev.length >= CONSTANTS.MAX_CAPTAINS) {
        toast.warning(
          `Maximum ${CONSTANTS.MAX_CAPTAINS} captains allowed. Replacing first captain.`
        );
        return [prev[1] || name, name];
      }
      return [...prev, name];
    });
  };

  const handleImportFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const result = extractPlayersFromFile(text, file.name);
        if (result.players && result.players.length > 0) {
          setRosterImportData(result);
        } else {
          toast.error('No valid players found in file');
        }
      } catch (err) {
        console.error('File import parse error:', err);
        toast.error('Failed to read file: invalid format');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRosterImport = (importedPlayers, mode = 'replace') => {
    saveSnapshot();
    if (mode === 'replace') {
      setPlayers(importedPlayers);
      setCaptains([]);
      setLineup(null);
    } else {
      // Append mode: keep existing players and add new ones (skip duplicate names)
      const existingNames = new Set(players.map((p) => p.name.toLowerCase().trim()));
      const uniqueNew = importedPlayers.filter(
        (p) => !existingNames.has(p.name.toLowerCase().trim())
      );
      setPlayers([...players, ...uniqueNew]);
    }
  };

  const handleExportRoster = () => {
    const content = rosterText(players);
    downloadTextFile(exportFilename(currentTeam?.name || 'Roster', 'txt'), content);
    toast.success('Downloaded roster file');
  };

  const handleClearAll = () => {
    setConfirmDialog({
      title: 'Clear Roster?',
      description: 'Are you sure you want to clear all players and reset the roster?',
      confirmText: 'Clear Roster',
      onConfirm: () => {
        saveSnapshot();
        setPlayers([]);
        setCaptains([]);
        setLineup(null);
        toast.info('Cleared all players');
      },
    });
  };

  const handleLoadDemo = () => {
    saveSnapshot();
    const demoNames = [
      'Alex Martinez', 'Sam Johnson', 'Jordan Chen', 'Taylor Brown', 'Casey Rivera',
      'Morgan Davis', 'Avery Thompson', 'Riley Kim', 'Cameron Wilson', 'Sage Anderson',
      'Quinn Rodriguez', 'Emery Williams', 'River Patel', 'Skyler Garcia', 'Rowan Clark',
      'Phoenix Lee', 'Sage Mitchell', 'Harley Cooper', 'Justice Turner', 'Cameron Hill',
      'Mason Garcia', 'Isabella Thompson', 'Ethan Williams', 'Sophia Rodriguez', 'Liam Anderson',
      'Emma Johnson', 'Noah Martinez', 'Olivia Davis', 'William Brown', 'Ava Wilson',
      'James Miller', 'Charlotte Moore', 'Benjamin Taylor', 'Amelia Jackson', 'Lucas White',
      'Harper Lewis', 'Henry Walker', 'Evelyn Hall', 'Alexander Allen', 'Abigail Young'
    ];

    const shuffled = [...demoNames];
    shuffleArray(shuffled);

    const curFieldPlayers = settingsRef.current?.fieldPlayers || settings.fieldPlayers;
    let count = 10;
    if (curFieldPlayers === 11) count = 18;
    else if (curFieldPlayers === 9) count = 14;
    else if (curFieldPlayers === 6) count = 8;

    const selected = shuffled.slice(0, count);
    const usedNums = new Set();

    const created = selected.map((name) => {
      let num;
      do {
        num = Math.floor(Math.random() * 99) + 1;
      } while (usedNums.has(num));
      usedNums.add(num);

      return {
        id: `demo-${num}`,
        name,
        number: num,
        status: 'available',
        noKeeper: Math.random() < 0.2,
        mustRest: false,
        overallRating: Math.floor(Math.random() * 3) + 3,
        positionalRatings: {},
      };
    });

    playersRef.current = created;
    setPlayers(created);
    setCaptains(created.slice(0, 2).map((p) => p.name));
    toast.success(`Loaded ${created.length} demo players`);
  };

  // Lineup generation
  const handleGenerateLineup = () => {
    const curPlayers = (playersRef.current && playersRef.current.length > 0) ? playersRef.current : players;
    const curSettings = settingsRef.current || settings;

    const activePlayers = curPlayers.filter(
      (p) => !p.status || p.status === 'available'
    );

    if (activePlayers.length < curSettings.fieldPlayers) {
      toast.error(
        `Need at least ${curSettings.fieldPlayers} available players for ${curSettings.fieldPlayers}v${curSettings.fieldPlayers} format`
      );
      return;
    }

    setIsGenerating(true);

    try {
      const positions = getPositionsForFormation(curSettings.fieldPlayers, curSettings.formation);
      const stats = calculatePlayerStats(curPlayers, gameHistory);

      // Select 2 team captains from active players (favoring players who have served as captain least)
      const statsMap = stats || {};
      const activeCandidates = [...activePlayers]
        .map((p) => ({
          name: p.name,
          captainCount: statsMap[p.name]?.captainGames || 0,
          randomKey: Math.random(),
        }))
        .sort((a, b) => {
          if (a.captainCount !== b.captainCount) return a.captainCount - b.captainCount;
          return a.randomKey - b.randomKey;
        });

      const selectedCaptains = activeCandidates.slice(0, 2).map((c) => c.name);
      if (selectedCaptains.length > 0) {
        setCaptains(selectedCaptains);
      }

      const result = generateLineup({
        players: JSON.parse(JSON.stringify(activePlayers)),
        positions,
        playersOnField: curSettings.fieldPlayers,
        quarters: curSettings.quarters || 4,
        maxAttempts: CONSTANTS.MAX_GENERATION_ATTEMPTS,
        seasonStats: stats,
      });

      if (result && result.lineup) {
        setLineup({
          quarters: result.lineup,
          warnings: result.validation || [],
          formation: curSettings.formation,
          fieldPlayers: curSettings.fieldPlayers,
          playerStats: result.players || [],
        });
        toast.success('Generated balanced game lineup!');
      } else {
        toast.error('Failed to generate a valid lineup rotation');
      }
    } catch (err) {
      console.error('Lineup generation error:', err);
      toast.error('An error occurred during lineup generation');
    } finally {
      setIsGenerating(false);
    }
  };

  // Lineup Action Handlers

  /**
   * The per-player records the export helpers read.
   *
   * They want the generated stats — quartersPlayed, quartersSitting,
   * positionsPlayed — not the plain roster, and they mark captains off
   * `isCaptain`, which the engine's copies do not carry.
   */
  const exportPlayers = () =>
    (lineup?.playerStats || players).map((p) => ({
      ...p,
      isCaptain: captains.includes(p.name),
    }));

  const handleCopyLineup = () => {
    if (!lineup) return;
    const text = lineupClipboardText(
      lineup.quarters,
      exportPlayers(),
      lineup.formation || settings.formation
    );
    navigator.clipboard.writeText(text);
    toast.success('Lineup copied to clipboard!');
  };

  const handleShareLineup = () => {
    if (!lineup) return;
    const shareData = {
      quarters: lineup.quarters,
      formation: lineup.formation,
      fieldPlayers: lineup.fieldPlayers,
      players: players,
      captains: captains,
      teamName: currentTeam?.name,
    };
    const url = buildShareUrl(shareData, window.location);
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Share link copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy share link to clipboard');
    });
  };

  const handleExportCSV = () => {
    if (!lineup) return;
    const csv = lineupCsv(lineup.quarters, exportPlayers());
    downloadTextFile(exportFilename(currentTeam?.name || 'Lineup', 'csv'), csv, 'text/csv');
    toast.success('Downloaded CSV lineup');
  };

  const handleExportText = () => {
    if (!lineup) return;
    const positions = getPositionsForFormation(
      lineup.fieldPlayers || settings.fieldPlayers,
      lineup.formation || settings.formation
    );
    const text = lineupText(lineup.quarters, positions, exportPlayers());
    downloadTextFile(exportFilename(currentTeam?.name || 'Lineup', 'txt'), text);
    toast.success('Downloaded text lineup');
  };

  const handlePrintLineup = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    if (!lineup) return;
    try {
      toast.info('Generating official AYSO Match Card PDF...');
      await generateMatchCardPdf({
        lineup,
        players,
        captains,
        teamName: currentTeam?.name || 'Our Team',
        ageDivision: settings.ageDivision,
        date: new Date().toLocaleDateString(),
        coachName: currentUser?.name || currentUser?.email || 'Coach',
      });
      toast.success('Downloaded official AYSO Match Card PDF!');
    } catch (err) {
      console.error('Match card PDF export failed:', err);
      toast.error('Failed to generate match card PDF');
    }
  };

  const handleSwapPositions = (fromQuarter, fromPosition, toQuarter, toPosition) => {
    if (!lineup) return;
    saveSnapshot();
    const fQ = Number(fromQuarter);
    const tQ = Number(toQuarter);
    const newQuarters = JSON.parse(JSON.stringify(lineup.quarters));
    const qFrom = newQuarters.find((q, idx) => Number(q.quarter != null ? q.quarter : idx + 1) === fQ);
    const qTo = newQuarters.find((q, idx) => Number(q.quarter != null ? q.quarter : idx + 1) === tQ);
    if (!qFrom || !qTo) return;

    const getVal = (q, pos) => {
      if (pos.startsWith('Sitting:')) {
        return pos.replace('Sitting:', '');
      }
      return q.positions[pos];
    };

    const fromVal = getVal(qFrom, fromPosition);
    const toVal = getVal(qTo, toPosition);

    const setVal = (q, pos, val) => {
      if (pos.startsWith('Sitting:')) {
        const oldName = pos.replace('Sitting:', '');
        q.sitting = q.sitting || [];
        const idx = q.sitting.indexOf(oldName);
        if (idx !== -1) {
          if (val) q.sitting[idx] = val;
          else q.sitting.splice(idx, 1);
        } else if (val) {
          q.sitting.push(val);
        }
      } else {
        q.positions[pos] = val;
      }
    };

    setVal(qFrom, fromPosition, toVal);
    setVal(qTo, toPosition, fromVal);

    // Reconstruct updated players and re-validate
    const updatedPlayers = JSON.parse(JSON.stringify(players));
    updatedPlayers.forEach((p) => {
      p.quartersPlayed = [];
      p.quartersSitting = [];
      p.positionsPlayed = [];
      p.defensiveQuarters = 0;
      p.offensiveQuarters = 0;
    });

    newQuarters.forEach((quarter) => {
      const onField = new Set(Object.values(quarter.positions));
      for (const [pos, pName] of Object.entries(quarter.positions)) {
        const p = updatedPlayers.find((pl) => pl.name === pName);
        if (p) {
          const qNum = quarter.quarter || 1;
          if (!p.quartersPlayed.includes(qNum)) p.quartersPlayed.push(qNum);
          p.positionsPlayed.push({ quarter: qNum, position: pos });
          if (pos === 'Keeper' || pos.includes('Back')) p.defensiveQuarters++;
          else p.offensiveQuarters++;
        }
      }
      updatedPlayers.forEach((p) => {
        const qNum = quarter.quarter || 1;
        if (!onField.has(p.name)) {
          if (!p.quartersSitting.includes(qNum)) p.quartersSitting.push(qNum);
        }
      });
    });

    const warnings = validateLineup(updatedPlayers, settings.quarters || 4);

    setLineup({
      ...lineup,
      quarters: newQuarters,
      warnings,
      playerStats: updatedPlayers,
    });
    toast.success('Swapped players successfully');
  };

  const handleSaveGameClick = () => {
    if (!lineup || !lineup.quarters || lineup.quarters.length === 0) {
      toast.error('Generate a lineup first');
      const errToast = document.createElement('div');
      errToast.className = 'notification notification-error';
      errToast.textContent = 'Generate a lineup first';
      document.body.appendChild(errToast);
      setTimeout(() => errToast.remove(), 4000);
      return;
    }
    setIsSaveGameOpen(true);
  };

  const handleSaveGame = ({ name, date }) => {
    if (!lineup) return;

    const gameEntry = {
      id: `game-${Date.now()}`,
      name,
      date,
      ageDivision: settingsRef.current.ageDivision,
      division: settingsRef.current.ageDivision,
      formation: lineup.formation || settingsRef.current.formation,
      fieldPlayers: lineup.fieldPlayers || settingsRef.current.fieldPlayers,
      quarters: lineup.quarters,
      players: lineup.playerStats || players,
      notes: '',
      createdAt: new Date().toISOString(),
    };

    setGameHistory((prev) => {
      const updated = [gameEntry, ...prev];
      safeSetToStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY, JSON.stringify(updated));
      return updated;
    });

    if (currentUser && currentTeam) {
      // The server issues the id a later edit or delete has to quote, and the
      // local 'game-<timestamp>' is no use to it. sync.js writes the cloud copy
      // to localStorage, but the effect that persists this state would put the
      // local one straight back, so the swap has to happen here too.
      pushGame(gameEntry)
        .then((result) => {
          const saved = result?.success && result.data;
          if (!saved || result.data.id === gameEntry.id) return;
          setGameHistory((prev) =>
            prev.map((g) => (g.id === gameEntry.id ? { ...g, ...result.data } : g))
          );
        })
        .catch(() => {});
    }

    toast.success(`Saved game: "${name}"`);
  };

  const handleDeleteGame = (gameId) => {
    setConfirmDialog({
      title: 'Delete Game Record?',
      description: 'Are you sure you want to delete this game record from season history?',
      confirmText: 'Delete Game',
      onConfirm: async () => {
        setGameHistory((prev) => {
          const updated = prev.filter((g) => g.id !== gameId);
          safeSetToStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY, JSON.stringify(updated));
          return updated;
        });

        if (currentUser && currentTeam) {
          // pushGameDelete quotes the game's own id — the call here passed the
          // team's, so the row survived and the next sync brought it back — and
          // queues the delete when there is no signal to send it over.
          try {
            await pushGameDelete(gameId);
          } catch (e) {}
        }

        toast.info('Game deleted');
      },
    });
  };

  const handleSaveNotes = (gameId, notes) => {
    setGameHistory((prev) => {
      const updated = prev.map((g) => (g.id === gameId ? { ...g, notes } : g));
      safeSetToStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY, JSON.stringify(updated));
      return updated;
    });

    // Notes stayed on the device until this: the next sync replaced local
    // history with the server's copy and took them with it.
    if (currentUser && currentTeam) {
      pushGameUpdate(gameId, { notes }).catch(() => {});
    }

    toast.success('Game notes saved');
  };

  const handleExportSeasonStats = () => {
    // players first: calculatePlayerStats keys its rows off the roster, and
    // handing it the game history alone produced a CSV of game names and zeros.
    const stats = calculatePlayerStats(players, gameHistory);
    downloadTextFile(
      seasonStatsFilename(currentTeam?.name || 'Season'),
      seasonStatsCsv(stats, { midfieldLine: formationHasMidfieldLine(settings?.formation) }),
      'text/csv'
    );
    toast.success('Downloaded season statistics CSV');
  };

  const handleClearSeasonHistory = () => {
    setConfirmDialog({
      title: 'Clear Season History?',
      description: 'Are you sure you want to permanently clear all season game history?',
      confirmText: 'Clear History',
      onConfirm: () => {
        setGameHistory([]);
        toast.info('Season history cleared');
      },
    });
  };

  // Schedule & Fixture handlers
  const handleAddFixture = () => {
    setEditingFixture(null);
    setIsFixtureModalOpen(true);
  };

  const handleEditFixture = (fixture) => {
    setEditingFixture(fixture);
    setIsFixtureModalOpen(true);
  };

  const handleSaveFixture = async (fixtureData) => {
    if (fixtureData.id) {
      setFixtures((prev) =>
        prev.map((f) => (f.id === fixtureData.id ? { ...f, ...fixtureData, updatedAt: new Date().toISOString() } : f))
      );
      if (currentUser && currentTeam) {
        // Through the sync engine, like a game edit: the call this replaced
        // went straight to the API inside a catch that only logged, so a match
        // rescheduled with no signal never left the device — and the next pull
        // put the old kick-off time back.
        pushFixtureUpdate(fixtureData.id, fixtureData).catch(() => {});
      }
    } else {
      const newFixture = {
        ...fixtureData,
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `fix-${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setFixtures((prev) => [...prev, newFixture]);
      if (currentUser && currentTeam) {
        try {
          // Through the sync engine rather than straight to the API: with no
          // signal this queues the match instead of dropping it
          const res = await pushFixture(newFixture);
          if (res.success && res.data?.id) {
            setFixtures((prev) =>
              prev.map((f) => (f.id === newFixture.id ? res.data : f))
            );
          }
        } catch (e) {
          console.error('Failed to save cloud fixture:', e);
        }
      }
    }
  };

  const handleDeleteFixture = (fixture) => {
    setConfirmDialog({
      title: 'Delete Match?',
      description: `Are you sure you want to delete match vs "${fixture.opponent}"?`,
      confirmText: 'Delete Match',
      onConfirm: async () => {
        setFixtures((prev) => prev.filter((f) => f.id !== fixture.id));
        if (currentUser && currentTeam && fixture.id) {
          // Queues the delete when there is no signal, and drops the creation
          // instead if the match has not reached the server yet.
          pushFixtureDelete(fixture.id).catch(() => {});
        }
        toast.info('Match deleted');
      },
    });
  };

  const handleGenerateLineupForFixture = (fixture) => {
    setActiveTab('roster');
    if (!lineup) {
      handleGenerateLineup();
    }
    toast.info(`Match against ${fixture.opponent} selected. Lineup ready for review!`);
  };

  const handleLaunchMatchdayForFixture = (fixture) => {
    if (!lineup) {
      handleGenerateLineup();
    }
    setMatchdayFixture(fixture);
    setIsMatchdayOpen(true);
  };

  const handleImportScheduleFile = async (file) => {
    try {
      const parsed = await extractFixturesFromFile(file, currentTeam?.name || '');
      if (!parsed.fixtures || parsed.fixtures.length === 0) {
        toast.error('No matches found in this calendar file.');
        return;
      }
      setScheduleImportData(parsed);
    } catch (err) {
      console.error('Schedule import error:', err);
      toast.error(`Could not read schedule file: ${err.message}`);
    }
  };

  const handleConfirmScheduleImport = async (importedFixtures, mode = 'merge') => {
    let finalFixtures = [];
    if (mode === 'replace') {
      finalFixtures = [...importedFixtures];
    } else {
      const isDuplicate = (incoming, existing) => {
        const d1 = incoming.gameDate || '';
        const d2 = existing.gameDate || '';
        const t1 = incoming.gameTime || '';
        const t2 = existing.gameTime || '';
        const o1 = (incoming.opponent || '').toLowerCase().trim();
        const o2 = (existing.opponent || '').toLowerCase().trim();
        return d1 === d2 && t1 === t2 && o1 === o2;
      };

      const uniqueNew = importedFixtures.filter(
        (imported) => !fixtures.some((existing) => isDuplicate(imported, existing))
      );

      finalFixtures = [...fixtures, ...uniqueNew];
    }

    finalFixtures.sort((a, b) => {
      const dA = a.gameDate || '';
      const dB = b.gameDate || '';
      if (dA !== dB) return dA.localeCompare(dB);
      return (a.gameTime || '').localeCompare(b.gameTime || '');
    });

    setFixtures(finalFixtures);
    safeSetToStorage(CONSTANTS.STORAGE_KEYS.SCHEDULE, JSON.stringify(finalFixtures));

    if (currentUser && currentTeam) {
      for (const fix of importedFixtures) {
        try {
          await pushFixture(fix);
        } catch (e) {
          console.error('Failed to sync imported fixture:', e);
        }
      }
    }
  };

  return (
    <div className="app-shell min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        currentUser={currentUser}
        currentTeam={currentTeam}
        teams={teams}
        syncStatus={syncStatus}
        onSelectTeam={handleSelectTeam}
        onOpenTeamModal={() => setIsTeamModalOpen(true)}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
      />

      {/* Main Content Area */}
      <main className="container max-w-6xl mx-auto px-4 py-6 flex-1 space-y-8" id="main-content">
        {/* Roster Tab Panel */}
        <div
          id="roster-tab"
          className={cn("player-section space-y-6", activeTab === 'roster' ? "active block" : "hidden")}
        >
          <RosterTab
            players={players}
            captains={captains}
            onAddPlayer={handleAddPlayer}
            onRemovePlayer={handleRemovePlayer}
            onUpdatePlayer={handleUpdatePlayer}
            onRenamePlayer={handleRenamePlayer}
            onToggleCaptain={handleToggleCaptain}
            onImportFile={handleImportFile}
            onExportRoster={handleExportRoster}
            onClearAll={handleClearAll}
            onLoadDemo={handleLoadDemo}
            currentUser={currentUser}
            onCreateTeam={() => {
              setTeamModalInitialTeamId(null);
              setTeamModalInitialView('create');
              setIsTeamModalOpen(true);
            }}
          />

          {/* Game Settings */}
          <GameSettings
            ageDivision={settings.ageDivision}
            fieldPlayers={settings.fieldPlayers}
            formation={settings.formation}
            onAgeDivisionChange={(ageDivision) => {
              const mapping = CONSTANTS.AGE_DIVISIONS[ageDivision];
              const fieldPlayers = mapping ? mapping.fieldSize : 7;
              const forms = getFormationsForFieldSize(fieldPlayers);
              updateSettings({
                ageDivision,
                fieldPlayers,
                formation: forms[0] || '2-3-1',
              });
            }}
            onFieldPlayersChange={(fieldPlayers) => {
              const forms = getFormationsForFieldSize(fieldPlayers);
              updateSettings({
                fieldPlayers,
                formation: forms[0] || '2-3-1',
              });
            }}
            onFormationChange={(formation) => {
              updateSettings({ formation });
            }}
            onGenerateLineup={handleGenerateLineup}
            isGenerating={isGenerating}
            playerCount={players.length}
            onOpenCustomFormation={() => setIsCustomFormationOpen(true)}
          />

          {/* Lineup Section */}
          <LineupSection
            lineup={lineup}
            captains={captains}
            onCopyLineup={handleCopyLineup}
            onShareLineup={handleShareLineup}
            onExportCSV={handleExportCSV}
            onExportText={handleExportText}
            onPrintLineup={handlePrintLineup}
            onSaveGame={handleSaveGameClick}
            onSwapPositions={handleSwapPositions}
            onRegenerate={handleGenerateLineup}
            onToggleMustRest={handleToggleMustRest}
            onToggleNoKeeper={handleToggleNoKeeper}
            onOpenMatchday={() => {
              setMatchdayFixture(null);
              setIsMatchdayOpen(true);
            }}
            onExportPdf={handleExportPdf}
          />
        </div>

        {/* Schedule Tab Panel */}
        <div
          id="schedule-tab"
          className={cn(activeTab === 'schedule' ? "active block" : "hidden")}
        >
          <ScheduleTab
            fixtures={fixtures}
            players={players}
            teamName={currentTeam?.name || 'Our Team'}
            ageDivision={settings.ageDivision}
            onAddFixture={handleAddFixture}
            onEditFixture={handleEditFixture}
            onDeleteFixture={handleDeleteFixture}
            onGenerateLineupForFixture={handleGenerateLineupForFixture}
            onLaunchMatchdayForFixture={handleLaunchMatchdayForFixture}
            onImportScheduleFile={handleImportScheduleFile}
          />
        </div>

        {/* Season Tab Panel */}
        <div
          id="season-tab"
          className={cn(activeTab === 'season' ? "active block" : "hidden")}
        >
          <SeasonTab
            formation={settings?.formation}
            gameHistory={gameHistory}
            players={players}
            onExportStats={handleExportSeasonStats}
            onClearHistory={handleClearSeasonHistory}
            onDeleteGame={handleDeleteGame}
            onOpenNotes={(game) => setNotesModalGame(game)}
            onViewGame={(game) => {
              const ageDivision = game.ageDivision || game.division || '10U';
              const fieldPlayers = game.fieldPlayers || (CONSTANTS.AGE_DIVISIONS[ageDivision] ? CONSTANTS.AGE_DIVISIONS[ageDivision].fieldSize : 7);
              const formation = game.formation || '2-3-1';
              // The screen alone: this is how that game was played, not a
              // decision about how the team plays from here on.
              updateSettings({ ageDivision, fieldPlayers, formation }, { push: false });
              setLineup({
                // Under the names this formation uses now: a 3-3 saved before
                // its middle line was renamed stores Left/Center/Right Mid,
                // and the forward rows would all read TBD.
                quarters: currentQuarters(game),
                formation,
                fieldPlayers,
                warnings: [],
                playerStats: game.players ? currentPlayerPositions(game) : players,
                generatedAt: Date.now(),
              });
              setActiveTab('roster');
              toast.info(`Viewing lineup from "${game.name}"`);
            }}
          />
        </div>

        {/* Evaluation Tab Panel */}
        <div
          id="evaluation-tab"
          className={cn(activeTab === 'evaluation' ? "active block" : "hidden")}
        >
          <EvaluationTab
            players={players}
            onUpdatePlayer={handleUpdatePlayer}
          />
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* What the Print button puts on paper; hidden on screen */}
      <PrintSheet
        lineup={lineup}
        players={players}
        captains={captains}
        teamName={currentTeam?.name || 'Our Team'}
        ageDivision={settings.ageDivision}
      />

      {/* Modals & Dialogs */}
      <TeamModal
        isOpen={isTeamModalOpen}
        onClose={() => {
          setIsTeamModalOpen(false);
          setTeamModalInitialTeamId(null);
          setTeamModalInitialView('list');
        }}
        currentTeam={currentTeam}
        teams={teams}
        initialTeamId={teamModalInitialTeamId}
        initialView={teamModalInitialView}
        onTeamsUpdated={refreshTeams}
        onSelectTeam={handleSelectTeam}
      />

      <SaveGameModal
        isOpen={isSaveGameOpen}
        onClose={() => setIsSaveGameOpen(false)}
        onSave={handleSaveGame}
      />

      <MatchdayDialog
        isOpen={isMatchdayOpen}
        onClose={() => {
          setIsMatchdayOpen(false);
          setMatchdayFixture(null);
        }}
        lineup={lineup}
        players={players}
        captains={captains}
        teamName={currentTeam?.name || 'Our Team'}
        ageDivision={settings.ageDivision}
        fixture={matchdayFixture}
        onSaveGame={handleSaveGame}
      />

      <FixtureModal
        isOpen={isFixtureModalOpen}
        onClose={() => {
          setIsFixtureModalOpen(false);
          setEditingFixture(null);
        }}
        fixture={editingFixture}
        players={players}
        onSave={handleSaveFixture}
      />

      <CustomFormationModal
        isOpen={isCustomFormationOpen}
        onClose={() => setIsCustomFormationOpen(false)}
        initialFieldSize={settings.fieldPlayers || 7}
        onFormationCreated={(formName, sz) => {
          updateSettings({ fieldPlayers: sz, formation: formName });
        }}
      />

      <RosterImportModal
        isOpen={Boolean(rosterImportData)}
        onClose={() => setRosterImportData(null)}
        parsedData={rosterImportData}
        onConfirmImport={handleConfirmRosterImport}
      />

      <ScheduleImportModal
        isOpen={Boolean(scheduleImportData)}
        onClose={() => setScheduleImportData(null)}
        parsedData={scheduleImportData}
        onConfirmImport={handleConfirmScheduleImport}
      />

      <GameNotesModal
        isOpen={Boolean(notesModalGame)}
        game={notesModalGame}
        onClose={() => setNotesModalGame(null)}
        onSaveNotes={handleSaveNotes}
      />

      <InviteModal
        isOpen={Boolean(inviteToken)}
        token={inviteToken}
        onClose={() => {
          setInviteToken(null);
          clearInviteTokenFromUrl();
        }}
        onInviteAccepted={(teamId) => {
          refreshTeams();
          if (teamId) handleSelectTeam(teamId);
        }}
      />

      <ShareLineupDialog
        isOpen={Boolean(shareUrl)}
        shareUrl={shareUrl}
        onClose={() => setShareUrl(null)}
      />

      <AlertDialog
        open={Boolean(confirmDialog)}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        {confirmDialog && (
          <AlertDialogContent id="confirmDialog">
            <AlertDialogHeader>
              <AlertDialogTitle id="confirmDialogTitle">{confirmDialog.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDialog.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel id="confirmDialogCancel" onClick={() => setConfirmDialog(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                id="confirmDialogConfirm"
                variant={confirmDialog.variant || 'destructive'}
                onClick={() => {
                  const cb = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  if (cb) cb();
                }}
              >
                {confirmDialog.confirmText || 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}
