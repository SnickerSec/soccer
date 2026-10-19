import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FORMATIONS,
  getFormationsForFieldSize,
  getFormationDescription,
} from '@/modules/formations';
import { History, Play, Sparkles } from 'lucide-react';
import { InfoTip } from '@/components/InfoTip';

const STRATEGY_DESCRIPTIONS = {
  balanced: 'Spreads your stronger players evenly across defense, midfield and attack each quarter.',
  defense: 'Puts your stronger players at the back and in midfield, and the rest up front.',
  offense: 'Puts your stronger players up front, and the rest behind them.',
};

export function GameSettings({
  ageDivision,
  fieldPlayers,
  formation,
  onAgeDivisionChange,
  onFieldPlayersChange,
  onFormationChange,
  keeperPlaysThree = false,
  onKeeperPlaysThreeChange,
  lineupStrategy = 'balanced',
  onLineupStrategyChange,
  onGenerateLineup,
  isGenerating,
  playerCount = 0,
  ratedPlayerCount = 0,
  availablePlayerCount = 0,
  onOpenCustomFormation,
  savedGameCount = 0,
  onLoadSavedGame,
}) {
  const availableFormations = getFormationsForFieldSize(fieldPlayers);
  const formationDesc = getFormationDescription(fieldPlayers, formation);

  // The division's rules, without a "10U Rules:" prefix — the tooltip they sit
  // in already leads with the division.
  const getAgeRules = () => {
    switch (ageDivision) {
      case '10U':
        return '7v7 with a build-out line, which also governs offside. No heading.';
      case '12U':
        return '9v9. No heading. Standard offside.';
      case '14U':
        return '11v11. Heading permitted. Full standard rules.';
      case '16U':
      case '19U':
        return '11v11, high school age. Full standard rules.';
      default:
        return 'Every player plays at least half the game.';
    }
  };

  const selectClasses =
    "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer";

  // Every column's label sits in a row of the same fixed height. A bare inline
  // label takes the line height of the div around it (24px), while Formation's
  // row, which also holds "+ Custom", came out at 16px — so the selects did
  // not line up.
  const labelRowClasses = 'flex h-5 items-center justify-between';
  const labelClasses = 'text-xs font-medium text-muted-foreground';
  const labelGroupClasses = 'flex items-center gap-1.5';
  // On a wide screen every control fits on one row, so the group headings go
  // (kept for screen readers) and a rule between the groups stands in for them.
  const legendClasses = 'mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:sr-only';
  // Each column is as wide as its select's longest option, not a third of the
  // card: "3-3" in a 340px box was mostly dead space.
  const columnClasses = 'space-y-1.5 lg:w-max';

  const ageRules = `${getAgeRules()} Four quarters, with substitutions between them.`;
  const strategyDesc = `${STRATEGY_DESCRIPTIONS[lineupStrategy] || STRATEGY_DESCRIPTIONS.balanced} Uses player ratings; everyone still rotates through every line.`;
  const keeperRuleDesc = 'Only players on for 3+ quarters keep goal, so nobody who sits twice also spends a quarter in goal.';

  return (
    <Card className="settings-section shadow-sm">
      {/*
        The button is the app's primary action and its label must not leave its
        box. In a plain `flex justify-between` row it did: the title block kept
        its natural width, the Button — a shrinkable flex item — was squeezed
        below its content width, and because the label is `nowrap` with visible
        overflow the text spilled outside the blue background rather than
        clipping. It escaped by 21px at 320, 13px at 375 and 10px at 390.

        So the button does not shrink and the title block does, and below `sm`
        they stack rather than compete for a width neither fits in.
      */}
      <CardHeader className="flex flex-col items-start gap-3 space-y-0 pb-4 border-b sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold">Game Settings</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Match format, and how the generator places your players
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          {savedGameCount > 0 && (
            <Button
              type="button"
              id="loadSavedGame"
              variant="outline"
              onClick={onLoadSavedGame}
              className="flex w-full items-center justify-center gap-1.5 sm:w-auto"
            >
              <History className="h-4 w-4" />
              <span>Load Saved Game</span>
            </Button>
          )}
          <Button
            type="button"
            id="generateLineup"
            size="default"
            onClick={onGenerateLineup}
            className="flex w-full shrink-0 items-center justify-center gap-1.5 shadow-sm sm:w-auto"
            aria-label="Generate lineup based on current players and settings"
          >
            {isGenerating ? (
              <Sparkles className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            <span>{isGenerating ? 'Generating...' : 'Generate Lineup'}</span>
          </Button>
        </div>
      </CardHeader>

      {/*
        The explanations live in tooltips behind an (i) beside each label, so the
        card is the controls and nothing else. Each is also kept in the DOM,
        visually hidden, as its control's aria-describedby — a screen reader
        hears it on focusing the select, without having to find the button.
      */}
      <CardContent className="pt-4 space-y-5 lg:flex lg:flex-wrap lg:items-end lg:gap-x-8 lg:gap-y-3 lg:space-y-0">
        <fieldset>
          <legend className={legendClasses}>Match format</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:flex lg:items-end">
            <div className={columnClasses}>
              <div className={labelRowClasses}>
                <div className={labelGroupClasses}>
                  <label htmlFor="ageDivision" className={labelClasses}>
                    Age division
                  </label>
                  <InfoTip label={`About ${ageDivision} rules`}>
                    <strong className="font-semibold">{ageDivision}:</strong> {ageRules}
                  </InfoTip>
                </div>
              </div>
              <select
                id="ageDivision"
                aria-describedby="ageRules"
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
              <span id="ageRules" className="sr-only">{ageRules}</span>
            </div>

            <div className={columnClasses}>
              <div className={labelRowClasses}>
                <label htmlFor="fieldPlayers" className={labelClasses}>
                  Players on field
                </label>
              </div>
              <select
                id="fieldPlayers"
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

            <div className={columnClasses}>
              <div className={`${labelRowClasses} lg:gap-4`}>
                <div className={labelGroupClasses}>
                  <label htmlFor="formation" className={labelClasses}>
                    Formation
                  </label>
                  <InfoTip label={`About the ${formation} formation`}>
                    <strong className="font-semibold">{formation}:</strong> {formationDesc}
                  </InfoTip>
                </div>
                <button
                  type="button"
                  id="openCustomFormation"
                  onClick={onOpenCustomFormation}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  + Custom
                </button>
              </div>
              <select
                id="formation"
                aria-describedby="formationDescription"
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
              <span id="formationDescription" className="sr-only">
                {formation}: {formationDesc}
              </span>
            </div>
          </div>
        </fieldset>

        {/* The rule is on the fieldset's parent: a fieldset's own border is
            drawn through its legend. */}
        <div className="border-t pt-4 lg:flex lg:items-end lg:self-stretch lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <fieldset>
            <legend className={legendClasses}>Lineup rules</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:flex lg:items-end">
              <div className={columnClasses}>
                <div className={labelRowClasses}>
                  <div className={labelGroupClasses}>
                    <label htmlFor="lineupStrategy" className={labelClasses}>
                      Strategy
                    </label>
                    <InfoTip label="About lineup strategies">{strategyDesc}</InfoTip>
                  </div>
                </div>
                <select
                  id="lineupStrategy"
                  aria-describedby="lineupStrategyDescription"
                  value={lineupStrategy}
                  onChange={(e) => onLineupStrategyChange?.(e.target.value)}
                  className={selectClasses}
                >
                  <option value="balanced">Balanced</option>
                  <option value="defense">Defense focus</option>
                  <option value="offense">Offense focus</option>
                </select>
                <span id="lineupStrategyDescription" className="sr-only">{strategyDesc}</span>
              </div>

              {/* An empty label row on wider screens, so the checkbox lines up
                  with the select beside it. */}
              <div className="space-y-1.5 sm:col-span-2 lg:w-max">
                <div className={`${labelRowClasses} hidden sm:flex`} aria-hidden="true" />
                <div className="flex items-center gap-1.5">
                  {/* The whole row is the tap target; the checkbox stays small.
                      The (i) sits outside the label so tapping it does not
                      toggle the rule. */}
                  <label
                    htmlFor="keeperPlaysThree"
                    className="-ml-2 flex min-h-11 sm:min-h-9 items-center gap-3 rounded-md px-2 text-xs font-medium text-foreground cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      id="keeperPlaysThree"
                      aria-describedby="keeperPlaysThreeDescription"
                      checked={keeperPlaysThree}
                      onChange={(e) => onKeeperPlaysThreeChange?.(e.target.checked)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                    />
                    Goalie must play 3+ quarters
                  </label>
                  <InfoTip label="About the goalie rule">{keeperRuleDesc}</InfoTip>
                  <span id="keeperPlaysThreeDescription" className="sr-only">{keeperRuleDesc}</span>
                </div>
              </div>
            </div>
          </fieldset>
        </div>

        {/* Not a tooltip: this is about the roster as it stands, and a coach
            has to see it to know the strategy is doing nothing. Outside the
            row, so on a wide screen it takes a line of its own rather than
            pushing the Strategy select out of line with the rest. */}
        {availablePlayerCount > 0 && ratedPlayerCount === 0 && (
          <p className="text-xs font-medium text-foreground lg:basis-full" id="lineupStrategyRatingsHint">
            No player here is rated yet, so every strategy gives the same lineup. Rate players with the button beside each name on the roster.
          </p>
        )}
        {ratedPlayerCount > 0 && ratedPlayerCount < availablePlayerCount && (
          <p className="text-xs text-muted-foreground lg:basis-full" id="lineupStrategyRatingsHint">
            {ratedPlayerCount} of {availablePlayerCount} players are rated; the rest count as 3 stars.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
