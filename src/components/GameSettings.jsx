import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FORMATIONS,
  getFormationsForFieldSize,
  getFormationDescription,
} from '@/modules/formations';
import { Play, Sparkles } from 'lucide-react';

export function GameSettings({
  ageDivision,
  fieldPlayers,
  formation,
  onAgeDivisionChange,
  onFieldPlayersChange,
  onFormationChange,
  onGenerateLineup,
  isGenerating,
  playerCount = 0,
}) {
  const availableFormations = getFormationsForFieldSize(fieldPlayers);
  const formationDesc = getFormationDescription(formation);

  const getAgeRules = () => {
    switch (ageDivision) {
      case '10U':
        return '10U Rules: 7v7 format with build-out line. No heading allowed. Offside enforced with build-out line. Substitutions at quarters.';
      case '12U':
        return '12U Rules: 9v9 format. No heading allowed. Standard offside rules apply. Substitutions at quarters.';
      case '14U':
        return '14U Rules: 11v11 format. Heading permitted. Full standard soccer rules apply.';
      case '16U':
      case '19U':
        return `${ageDivision} Rules: 11v11 format. High school age competition. Full standard soccer rules apply.`;
      default:
        return 'Standard AYSO fair rotation rules: every player plays at least 50% of the game.';
    }
  };

  const selectClasses =
    "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer";

  return (
    <Card className="settings-section shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
        <div>
          <CardTitle className="text-base font-semibold">Game Settings</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure division, field size, and tactical formation
          </p>
        </div>
        <Button
          type="button"
          id="generateLineup"
          size="default"
          onClick={onGenerateLineup}
          className="flex items-center gap-1.5 shadow-sm"
          aria-label="Generate lineup based on current players and settings"
        >
          {isGenerating ? (
            <Sparkles className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
          <span>{isGenerating ? 'Generating...' : 'Generate Lineup'}</span>
        </Button>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Settings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Age Division */}
          <div className="space-y-1.5">
            <label htmlFor="ageDivision" className="text-xs font-medium text-muted-foreground">
              Age Division:
            </label>
            <select
              id="ageDivision"
              aria-label="Select age division"
              value={ageDivision}
              onChange={(e) => onAgeDivisionChange(e.target.value)}
              className={selectClasses}
            >
              <option value="10U">10U (Under 10)</option>
              <option value="12U">12U (Under 12)</option>
              <option value="14U">14U (Under 14)</option>
              <option value="16U">16U (Under 16)</option>
              <option value="19U">19U (Under 19)</option>
            </select>
          </div>

          {/* Players on Field */}
          <div className="space-y-1.5">
            <label htmlFor="fieldPlayers" className="text-xs font-medium text-muted-foreground">
              Players on Field:
            </label>
            <select
              id="fieldPlayers"
              aria-label="Select number of players on the field"
              value={fieldPlayers}
              onChange={(e) => onFieldPlayersChange(parseInt(e.target.value, 10))}
              className={selectClasses}
            >
              {ageDivision === '10U' && (
                <>
                  <option value={7}>7v7 (Standard)</option>
                  <option value={6}>6v6 (Small-sided)</option>
                </>
              )}
              {ageDivision === '12U' && (
                <option value={9}>9v9 (Standard)</option>
              )}
              {(ageDivision === '14U' || ageDivision === '16U' || ageDivision === '19U') && (
                <option value={11}>11v11 (Standard)</option>
              )}
            </select>
          </div>

          {/* Formation */}
          <div className="space-y-1.5">
            <label htmlFor="formation" className="text-xs font-medium text-muted-foreground">
              Formation:
            </label>
            <select
              id="formation"
              aria-label="Select formation for the lineup"
              value={formation}
              onChange={(e) => onFormationChange(e.target.value)}
              className={selectClasses}
            >
              {availableFormations.map((formKey) => {
                const f = FORMATIONS[formKey];
                return (
                  <option key={formKey} value={formKey}>
                    {f ? `${formKey} (${f.name})` : formKey}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Quarters */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground block">
              Quarters:
            </span>
            <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-xs font-medium">
              4 (AYSO Standard)
            </div>
          </div>
        </div>

        {/* Formation & Age Rules descriptions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
          <div className="p-3 rounded-md bg-muted/40 border text-muted-foreground" id="formationDescription">
            <strong className="text-foreground">{formation} Formation: </strong>
            {formationDesc}
          </div>
          <div className="p-3 rounded-md bg-muted/40 border text-muted-foreground" id="ageRules">
            {getAgeRules()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
