import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '@/components/Header';
import { RosterTab } from '@/components/RosterTab';
import { GameSettings } from '@/components/GameSettings';
import { LineupSection } from '@/components/LineupSection';
import { SeasonTab } from '@/components/SeasonTab';
import { EvaluationTab } from '@/components/EvaluationTab';
import { TeamModal } from '@/components/TeamModal';
import { SaveGameModal } from '@/components/SaveGameModal';
import { GameNotesModal } from '@/components/GameNotesModal';
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
import { deleteGame as deleteGameFromCloud } from '@/modules/cloud-storage';
import {
  downloadTextFile,
  lineupCsv,
  lineupClipboardText,
  lineupText,
  rosterText,
  exportFilename,
  seasonStatsFilename,
} from '@/modules/export';
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

  // Auth & Teams
  const [currentUser, setCurrentUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [currentTeam, setCurrentTeamState] = useState(null);
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.OFFLINE);

  // Modals
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [teamModalInitialTeamId, setTeamModalInitialTeamId] = useState(null);
  const [isSaveGameOpen, setIsSaveGameOpen] = useState(false);
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
      pushPlayers(
        players.map((p) => ({
          ...p,
          isCaptain: captains.includes(p.name),
        }))
      ).catch(() => {});
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
        let newPlayers = [];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          newPlayers = Array.isArray(parsed) ? parsed : parsed.players || [];
        } else {
          // Parse .txt: lines with "Name #Number" or just "Name"
          const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
          newPlayers = lines.map((line, idx) => {
            const match = line.trim().match(/^(.*?)(?:\s+#?(\d+))?$/);
            const pName = match ? match[1].trim() : line.trim();
            const pNum = match && match[2] ? parseInt(match[2], 10) : undefined;
            return {
              name: pName,
              number: pNum,
              status: 'available',
            };
          });
        }

        if (newPlayers.length > 0) {
          saveSnapshot();
          setPlayers(newPlayers);
          setCaptains([]);
          toast.success(`Imported ${newPlayers.length} players successfully`);
        } else {
          toast.error('No valid players found in file');
        }
      } catch (err) {
        toast.error('Failed to read file: invalid format');
      }
    };
    reader.readAsText(file);
  };

  const handleExportRoster = () => {
    const content = rosterText(players);
    downloadTextFile(content, exportFilename(currentTeam?.name || 'Roster', 'txt'));
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
    setCaptains([created[0].name]);
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
  const handleCopyLineup = () => {
    if (!lineup) return;
    const text = lineupClipboardText(lineup, {
      teamName: currentTeam?.name,
      captains,
    });
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
    const csv = lineupCsv(lineup);
    downloadTextFile(csv, exportFilename(currentTeam?.name || 'Lineup', 'csv'));
    toast.success('Downloaded CSV lineup');
  };

  const handleExportText = () => {
    if (!lineup) return;
    const text = lineupText(lineup, {
      teamName: currentTeam?.name,
      captains,
    });
    downloadTextFile(text, exportFilename(currentTeam?.name || 'Lineup', 'txt'));
    toast.success('Downloaded text lineup');
  };

  const handlePrintLineup = () => {
    window.print();
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
    const stats = calculatePlayerStats(gameHistory);
    let csv = 'Player,Games Played,Quarters Played,Keeper,Defense,Midfield,Offense,Sitting\n';
    Object.entries(stats).forEach(([name, s]) => {
      csv += `"${name}",${s.gamesPlayed || 0},${s.quartersPlayed || 0},${s.keeperQuarters || 0},${s.defenseQuarters || 0},${s.midfieldQuarters || 0},${s.offenseQuarters || 0},${s.sittingQuarters || 0}\n`;
    });
    downloadTextFile(csv, seasonStatsFilename(currentTeam?.name || 'Season'));
    toast.success('Downloaded season statistics CSV');
  };

  const handleClearSeasonHistory = () => {
    if (!confirm('Are you sure you want to permanently clear all season game history?')) {
      return;
    }
    setGameHistory([]);
    toast.info('Season history cleared');
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
            onToggleCaptain={handleToggleCaptain}
            onImportFile={handleImportFile}
            onExportRoster={handleExportRoster}
            onClearAll={handleClearAll}
            onLoadDemo={handleLoadDemo}
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
        }}
        currentTeam={currentTeam}
        teams={teams}
        initialTeamId={teamModalInitialTeamId}
        onTeamsUpdated={refreshTeams}
        onSelectTeam={handleSelectTeam}
      />

      <SaveGameModal
        isOpen={isSaveGameOpen}
        onClose={() => setIsSaveGameOpen(false)}
        onSave={handleSaveGame}
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
