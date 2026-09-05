import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Undo2,
  Redo2,
  Sun,
  Moon,
  Settings,
  LogOut,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { syncStatusPresentation } from '@/modules/account-menu';

export function Header({
  activeTab = 'roster',
  onTabChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  currentUser,
  currentTeam,
  teams = [],
  syncStatus = 'offline',
  onSelectTeam,
  onOpenTeamModal,
  onSignIn,
  onSignOut,
}) {
  const { theme, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const panelRef = useRef(null);

  const sync = syncStatusPresentation(syncStatus);

  useEffect(() => {
    if (!isMenuOpen) return;

    // Focus first interactive item in menu
    const firstItem = panelRef.current?.querySelector('.account-item');
    if (firstItem) {
      firstItem.focus();
    }

    const handleClickOutside = (e) => {
      const panel = document.getElementById('accountPanel');
      const trigger = document.getElementById('accountTrigger');
      if (panel && !panel.contains(e.target) && trigger && !trigger.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        const trigger = document.getElementById('accountTrigger');
        if (trigger) trigger.focus();
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const handleTeamClick = (teamId) => {
    const activeId = currentTeam?.id || window.lineupGenerator?.currentTeamId;
    if (teamId !== activeId) {
      if (window.lineupGenerator?.switchTeam) {
        window.lineupGenerator.switchTeam(teamId);
      } else if (onSelectTeam) {
        onSelectTeam(teamId);
      }
    }
    setIsMenuOpen(false);
  };

  const handleManageTeamsClick = () => {
    if (window.lineupGenerator?.showTeamModal) {
      window.lineupGenerator.showTeamModal();
    }
    if (onOpenTeamModal) {
      onOpenTeamModal();
    }
    setIsMenuOpen(false);
  };

  return (
    <header className="site-header border-b bg-card px-4 sm:px-6">
      <div className="site-header-inner max-w-6xl mx-auto flex items-center justify-between gap-4 py-2 sm:py-3">
        {/* Brand */}
        <div className="brand flex items-center gap-3 shrink-0">
          <img src="/favicon.svg" alt="" className="brand-mark h-8 w-8 shrink-0" width="32" height="32" />
          <div className="brand-text">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground whitespace-nowrap leading-none m-0">
              Shinguard
            </h1>
            <p className="subtitle text-xs text-muted-foreground hidden sm:block mt-0.5 m-0">
              Fair rotation for youth soccer
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav aria-label="Sections" className="site-nav tab-navigation flex justify-center">
          <div role="tablist" className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground grid w-full grid-cols-4 min-w-[360px] max-w-[520px]">
            <button
              type="button"
              role="tab"
              id="roster-tab-btn"
              aria-controls="roster-tab"
              aria-selected={activeTab === 'roster'}
              onClick={() => onTabChange && onTabChange('roster')}
              className={cn(
                "tab-button inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium transition-all cursor-pointer",
                activeTab === 'roster' && "active bg-background text-foreground shadow font-semibold"
              )}
            >
              Roster
            </button>
            <button
              type="button"
              role="tab"
              id="schedule-tab-btn"
              aria-controls="schedule-tab"
              aria-selected={activeTab === 'schedule'}
              onClick={() => onTabChange && onTabChange('schedule')}
              className={cn(
                "tab-button inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium transition-all cursor-pointer",
                activeTab === 'schedule' && "active bg-background text-foreground shadow font-semibold"
              )}
            >
              Schedule
            </button>
            <button
              type="button"
              role="tab"
              id="season-tab-btn"
              aria-controls="season-tab"
              aria-selected={activeTab === 'season'}
              onClick={() => onTabChange && onTabChange('season')}
              className={cn(
                "tab-button inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium transition-all cursor-pointer",
                activeTab === 'season' && "active bg-background text-foreground shadow font-semibold"
              )}
            >
              Season
            </button>
            <button
              type="button"
              role="tab"
              id="evaluation-tab-btn"
              aria-controls="evaluation-tab"
              aria-selected={activeTab === 'evaluation'}
              onClick={() => onTabChange && onTabChange('evaluation')}
              className={cn(
                "tab-button inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium transition-all cursor-pointer",
                activeTab === 'evaluation' && "active bg-background text-foreground shadow font-semibold"
              )}
            >
              Evaluation
            </button>
          </div>
        </nav>

        {/* Header Controls */}
        <div className="header-controls flex items-center justify-end gap-2 shrink-0">
          {/* Undo / Redo */}
          <div className="flex items-center gap-1 border-r pr-2">
            <Button
              variant="ghost"
              size="icon"
              id="undoBtn"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo last change (Ctrl+Z)"
              aria-label="Undo last change"
            >
              <svg className="icon w-4 h-4" aria-hidden="true">
                <use href="/assets/icons.svg#icon-undo" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              id="redoBtn"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo last change (Ctrl+Y)"
              aria-label="Redo last change"
            >
              <svg className="icon w-4 h-4" aria-hidden="true">
                <use href="/assets/icons.svg#icon-redo" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              id="themeToggle"
              onClick={toggleTheme}
              title="Switch between dark and light theme"
              aria-label="Switch between dark and light theme"
            >
              <span className={cn("theme-icon-dark flex items-center justify-center", theme !== 'dark' && "hidden")}>
                <svg className="icon w-4 h-4" aria-hidden="true">
                  <use href="/assets/icons.svg#icon-theme-dark" />
                </svg>
              </span>
              <span className={cn("theme-icon-light flex items-center justify-center", theme !== 'light' && "hidden")}>
                <svg className="icon w-4 h-4" aria-hidden="true">
                  <use href="/assets/icons.svg#icon-theme-light" />
                </svg>
              </span>
            </Button>
          </div>

          {/* Authentication & Account Dropdown */}
          <div id="authContainer">
            {/* When signed out: Google Sign In Button */}
            <div id="authSignedOut" className={cn(currentUser && "hidden")}>
              <Button
                variant="outline"
                size="sm"
                onClick={onSignIn}
                id="signInBtn"
                className="flex items-center gap-2 text-xs"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 000 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"/>
                  <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"/>
                </svg>
                <span>Sign in with Google</span>
              </Button>
            </div>

            {/* When signed in: User Menu & Account Panel */}
            <div id="userMenu" className={cn("relative", !currentUser && "hidden")}>
              <button
                type="button"
                id="accountTrigger"
                aria-haspopup="true"
                aria-expanded={isMenuOpen ? "true" : "false"}
                aria-label="Account and teams"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="h-8 w-8 rounded-full flex items-center justify-center cursor-pointer p-0 border-0 bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Avatar className="h-7 w-7 pointer-events-none">
                  <AvatarImage src={currentUser?.avatarUrl || ''} alt="" />
                  <AvatarFallback className="p-0 flex items-center justify-center">
                    <svg className="icon w-4 h-4" aria-hidden="true">
                      <use href="/assets/icons.svg#icon-user" />
                    </svg>
                  </AvatarFallback>
                </Avatar>
              </button>

              {/* Account Dropdown Panel */}
              <div
                ref={panelRef}
                id="accountPanel"
                role="menu"
                className={cn(
                  "absolute right-0 top-full mt-2 w-56 p-1.5 rounded-lg border bg-popover text-popover-foreground shadow-lg z-50",
                  !isMenuOpen && "hidden"
                )}
              >
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-sm font-medium leading-none truncate" id="accountName">
                    {currentUser?.displayName || 'Coach'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground truncate" id="accountEmail">
                    {currentUser?.email || ''}
                  </p>
                </div>

                <div className="px-2 py-1.5 border-t border-b bg-muted/40 my-1 rounded">
                  <div
                    id="syncStatus"
                    role="status"
                    aria-live="polite"
                    className={cn("sync-status flex items-center gap-1.5 text-xs", sync.state)}
                  >
                    <span className="sync-icon flex items-center justify-center">
                      <svg className="icon w-3.5 h-3.5" aria-hidden="true">
                        <use href={`/assets/icons.svg#${sync.icon}`} />
                      </svg>
                    </span>
                    <span className="sync-text font-medium text-xs">
                      {sync.label}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground px-2 pt-1 pb-1 font-semibold uppercase tracking-wider">
                  Teams
                </div>
                <div className="max-h-40 overflow-y-auto space-y-0.5" id="accountTeamList" role="menu">
                  {teams.length === 0 ? (
                    <div className="account-empty p-2 text-xs text-muted-foreground">No teams yet</div>
                  ) : (
                    teams.map((team) => {
                      const isCurrent = currentTeam?.id === team.id;
                      return (
                        <button
                          key={team.id}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={isCurrent ? "true" : "false"}
                          onClick={() => handleTeamClick(team.id)}
                          className="account-team account-item w-full text-left p-2 flex items-center justify-between text-xs hover:bg-muted/50 rounded transition-colors cursor-pointer"
                        >
                          <div className="flex flex-col truncate pr-2">
                            <span className="font-medium text-foreground truncate">{team.name}</span>
                            <span className="text-[10px] text-muted-foreground capitalize">{team.role || 'coach'}</span>
                          </div>
                          {isCurrent && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="border-t my-1" />

                <button
                  type="button"
                  role="menuitem"
                  id="manageTeams"
                  onClick={handleManageTeamsClick}
                  className="account-item w-full text-left p-2 flex items-center gap-2 text-xs hover:bg-muted/50 rounded transition-colors cursor-pointer"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Manage teams
                </button>

                <button
                  type="button"
                  role="menuitem"
                  id="signOutBtn"
                  onClick={() => {
                    if (onSignOut) onSignOut();
                    setIsMenuOpen(false);
                  }}
                  className="account-item w-full text-left p-2 flex items-center gap-2 text-xs text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
