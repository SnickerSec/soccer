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
import { InviteModal } from '@/components/InviteModal';
import { ShareLineupDialog } from '@/components/ShareLineupDialog';
import { Footer } from '@/components/Footer';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { CONSTANTS } from '@/constants';
import {
  safeGetFromStorage,
  safeSetToStorage,
  safeParseJSON,
} from '@/modules/storage';
import { shuffleArray } from '@/modules/utils';
import {
  getPositionsForFormation,
  getFormationsForFieldSize,
} from '@/modules/formations';
import { generateLineup, validateLineup } from '@/modules/lineup-engine';
import { calculatePlayerStats } from '@/modules/season-stats';
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
} from '@/modules/auth';
import {
  initSync,
  sync,
  pushPlayers,
  pushGame,
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
  deleteGame as deleteGameFromCloud,
  getFixtures,
  saveFixture as saveFixtureToCloud,
  updateFixture as updateFixtureInCloud,
  deleteFixture as deleteFixtureFromCloud,
} from '@/modules/cloud-storage';
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
import { generateMatchCardPdf } from '@/modules/match-card-pdf';
import { extractPlayersFromFile } from '@/modules/roster-importer';
import { buildShareUrl, decodeShareData } from '@/modules/share-link';
import { toast } from 'sonner';

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
  const [settings, setSettings] = useState(() => {
    const saved = safeParseJSON(
      safeGetFromStorage(CONSTANTS.STORAGE_KEYS.SETTINGS),
      null
    );
    return (
      saved || {
        ageDivision: '10U',
        fieldPlayers: 7,
        formation: '2-3-1',
        quarters: 4,
      }
    );
  });

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
  const [fixtures, setFixtures] = useState(() => {
    const saved = safeParseJSON(
      safeGetFromStorage(CONSTANTS.STORAGE_KEYS.SCHEDULE),
      []
    );
    return Array.isArray(saved) ? saved : [];
  });

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
  const [notesModalGame, setNotesModalGame] = useState(null);
  const [inviteToken, setInviteToken] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);

  // Undo / Redo History
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
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
  const testAuthUserRef = useRef(null);
  // Renames waiting to be told to the server. Held rather than sent on their
  // own so they travel with the roster push that already carries the new name.
  const pendingRenamesRef = useRef([]);

  // Track state for undo
  const saveSnapshot = useCallback(() => {
    const snapshot = {
      players: JSON.parse(JSON.stringify(players)),
      captains: [...captains],
      settings: { ...settings },
    };
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > CONSTANTS.MAX_UNDO_STACK_SIZE) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [players, captains, settings]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const current = {
      players: JSON.parse(JSON.stringify(players)),
      captains: [...captains],
      settings: { ...settings },
    };
    redoStackRef.current.push(current);

    const previous = undoStackRef.current.pop();
    if (previous) {
      setPlayers(previous.players);
      setCaptains(previous.captains);
      setSettings(previous.settings);
    }
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
    toast.info('Undo applied');
  }, [players, captains, settings]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const current = {
      players: JSON.parse(JSON.stringify(players)),
      captains: [...captains],
      settings: { ...settings },
    };
    undoStackRef.current.push(current);

    const next = redoStackRef.current.pop();
    if (next) {
      setPlayers(next.players);
      setCaptains(next.captains);
      setSettings(next.settings);
    }
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    toast.info('Redo applied');
  }, [players, captains, settings]);

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
          await initSync((status) => {
            setSyncStatus(status);
          });
          await refreshTeams();
        }
      } catch (err) {
        console.error('Auth/Sync init error:', err);
      }
    };
    setupAuth();
  }, [refreshTeams]);

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
    const localFixtures = safeParseJSON(
      safeGetFromStorage(CONSTANTS.STORAGE_KEYS.SCHEDULE),
      []
    );
    setFixtures(localFixtures);
    if (teamId) {
      getFixtures(teamId).then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setFixtures(res.data);
        }
      }).catch(() => {});
    }
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
    if (!confirm('Are you sure you want to clear all players and reset the roster?')) {
      return;
    }
    saveSnapshot();
    setPlayers([]);
    setCaptains([]);
    setLineup(null);
    toast.info('Cleared all players');
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
      const statsMap = stats?.players || {};
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
    }).catch(() => {});
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
      pushGame(gameEntry).catch(() => {});
    }

    toast.success(`Saved game: "${name}"`);
  };

  const handleDeleteGame = async (gameId) => {
    if (!confirm('Are you sure you want to delete this game record?')) return;

    setGameHistory((prev) => {
      const updated = prev.filter((g) => g.id !== gameId);
      safeSetToStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY, JSON.stringify(updated));
      return updated;
    });

    if (currentUser && currentTeam) {
      try {
        await deleteGameFromCloud(currentTeam.id, gameId);
      } catch (e) {}
    }

    toast.info('Game deleted');
  };

  const handleSaveNotes = (gameId, notes) => {
    setGameHistory((prev) => {
      const updated = prev.map((g) => (g.id === gameId ? { ...g, notes } : g));
      safeSetToStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY, JSON.stringify(updated));
      return updated;
    });
    toast.success('Game notes saved');
  };

  const handleExportSeasonStats = () => {
    // players first: calculatePlayerStats keys its rows off the roster, and
    // handing it the game history alone produced a CSV of game names and zeros.
    const stats = calculatePlayerStats(players, gameHistory);
    downloadTextFile(
      seasonStatsFilename(currentTeam?.name || 'Season'),
      seasonStatsCsv(stats),
      'text/csv'
    );
    toast.success('Downloaded season statistics CSV');
  };

  const handleClearSeasonHistory = () => {
    if (!confirm('Are you sure you want to permanently clear all season game history?')) {
      return;
    }
    setGameHistory([]);
    toast.info('Season history cleared');
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
        try {
          await updateFixtureInCloud(fixtureData.id, fixtureData);
        } catch (e) {
          console.error('Failed to update cloud fixture:', e);
        }
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
          const res = await saveFixtureToCloud(currentTeam.id, newFixture);
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

  const handleDeleteFixture = async (fixture) => {
    if (!confirm(`Are you sure you want to delete match vs "${fixture.opponent}"?`)) {
      return;
    }
    setFixtures((prev) => prev.filter((f) => f.id !== fixture.id));
    if (currentUser && currentTeam && fixture.id) {
      try {
        await deleteFixtureFromCloud(fixture.id);
      } catch (e) {
        console.error('Failed to delete cloud fixture:', e);
      }
    }
    toast.info('Match deleted');
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
      const generated = generateLineup(players, settings);
      if (generated && generated.quarters) {
        setLineup(generated);
      }
    }
    setMatchdayFixture(fixture);
    setIsMatchdayOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
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
              const newSettings = {
                ...settingsRef.current,
                ageDivision,
                fieldPlayers,
                formation: forms[0] || '2-3-1',
              };
              settingsRef.current = newSettings;
              setSettings(newSettings);
            }}
            onFieldPlayersChange={(fieldPlayers) => {
              const forms = getFormationsForFieldSize(fieldPlayers);
              const newSettings = {
                ...settingsRef.current,
                fieldPlayers,
                formation: forms[0] || '2-3-1',
              };
              settingsRef.current = newSettings;
              setSettings(newSettings);
            }}
            onFormationChange={(formation) => {
              const newSettings = { ...settingsRef.current, formation };
              settingsRef.current = newSettings;
              setSettings(newSettings);
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
          />
        </div>

        {/* Season Tab Panel */}
        <div
          id="season-tab"
          className={cn(activeTab === 'season' ? "active block" : "hidden")}
        >
          <SeasonTab
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
              const newSettings = {
                ...settingsRef.current,
                ageDivision,
                fieldPlayers,
                formation,
              };
              settingsRef.current = newSettings;
              setSettings(newSettings);
              safeSetToStorage(CONSTANTS.STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
              setLineup({
                quarters: game.quarters,
                formation,
                fieldPlayers,
                warnings: [],
                playerStats: game.players || players,
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
          const newSettings = {
            ...settingsRef.current,
            fieldPlayers: sz,
            formation: formName,
          };
          settingsRef.current = newSettings;
          setSettings(newSettings);
        }}
      />

      <RosterImportModal
        isOpen={Boolean(rosterImportData)}
        onClose={() => setRosterImportData(null)}
        parsedData={rosterImportData}
        onConfirmImport={handleConfirmRosterImport}
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
    </div>
  );
}
