import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, CloudOff, FileText, Loader2, Pencil, Sparkles, TriangleAlert } from 'lucide-react';
import { generateEvaluationPdf, EVALUATION_FORM_SLOTS } from '@/modules/evaluation-pdf';
import { DEFAULT_SETTINGS, EVALUATION_DIVISIONS, EVALUATION_GENDERS, EVALUATION_NAME_MAX, evaluationDivision } from '@/modules/team-settings';
import { showNotification } from '@/modules/notifications';
import { evaluationSaveStatus } from '@/modules/evaluation-save-status';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * The form's header is saved with the team's settings, so it is there next
 * time and on the other coaches' devices. The names are drafts while they are
 * typed and saved on blur — a push per keystroke would be a request per
 * letter — and the selects save as they change.
 */
const STATUS_ICONS = { editing: Pencil, pending: Loader2, saved: Check, local: CloudOff, error: TriangleAlert };

function SaveStatus({ status }) {
  const Icon = STATUS_ICONS[status.tone];
  return (
    <div
      id="evaluationSaveStatus"
      role="status"
      aria-live="polite"
      data-tone={status.tone}
      className={cn(
        'sticky top-0 z-10 -mx-1 px-3 py-2 rounded-md border bg-card/95 backdrop-blur flex items-center gap-2 text-xs shadow-sm',
        status.tone === 'saved' && 'text-success',
        status.tone === 'error' && 'text-destructive',
        status.tone !== 'saved' && status.tone !== 'error' && 'text-muted-foreground'
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', status.tone === 'pending' && 'animate-spin')} aria-hidden="true" />
      <span>{status.label}</span>
    </div>
  );
}

/**
 * A comment is a draft while it is typed and saved on blur or Enter. Saving
 * per keystroke sent the whole roster to the server once per letter, and
 * every one of those writes could collide with another coach's edit.
 */
function CommentInput({ player, idx, onCommit, onEditingChange }) {
  const saved = player.comments || '';
  const [draft, setDraft] = useState(saved);
  useEffect(() => { setDraft(saved); }, [saved]);
  useEffect(() => { onEditingChange(`comment-${idx}`, draft !== saved); }, [draft, saved, idx, onEditingChange]);
  useEffect(() => () => onEditingChange(`comment-${idx}`, false), [idx, onEditingChange]);

  return (
    <Input
      type="text"
      id={`comment-${idx}`}
      aria-label={`Comments for ${player.name}`}
      placeholder="Coach comments (strengths, growth areas...)"
      maxLength={50}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== saved) onCommit(idx, draft); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="h-8 text-xs"
    />
  );
}

export function EvaluationTab({
  players = [], onUpdatePlayer, settings, onUpdateSettings,
  signedIn = false, canWrite = true, syncStatus,
}) {
  const saved = settings?.evaluation || DEFAULT_SETTINGS.evaluation;
  const division = evaluationDivision(settings);
  const gender = saved.gender;
  const [coachName, setCoachName] = useState(saved.coachName);
  const [assistantCoach, setAssistantCoach] = useState(saved.assistantCoach);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingFields, setEditingFields] = useState(() => new Set());

  const handleEditingChange = useCallback((key, editing) => {
    setEditingFields((current) => {
      if (current.has(key) === editing) return current;
      const next = new Set(current);
      if (editing) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const headerEditing = coachName !== saved.coachName || assistantCoach !== saved.assistantCoach;
  const status = evaluationSaveStatus({
    editing: headerEditing || editingFields.size > 0,
    signedIn,
    canWrite,
    syncStatus,
  });

  // A pull or a team switch replaces what is saved; show it.
  useEffect(() => { setCoachName(saved.coachName); }, [saved.coachName]);
  useEffect(() => { setAssistantCoach(saved.assistantCoach); }, [saved.assistantCoach]);

  const saveEvaluation = (patch) => {
    if (!onUpdateSettings) return;
    const next = { ...saved, ...patch };
    const changed = Object.keys(next).some((key) => next[key] !== saved[key]);
    if (changed) onUpdateSettings({ evaluation: next });
  };

  const handleRatingChange = (idx, ratingVal) => {
    const player = players[idx];
    if (!player) return;
    const num = ratingVal === '' ? null : parseInt(ratingVal, 10);
    if (onUpdatePlayer) {
      onUpdatePlayer(idx, { ...player, overallRating: num });
    }
  };

  const handleCommentChange = (idx, comments) => {
    const player = players[idx];
    if (!player) return;
    if (onUpdatePlayer) {
      onUpdatePlayer(idx, { ...player, comments });
    }
  };

  const handleGeneratePDF = async () => {
    if (players.length === 0) {
      toast.error('Please add players to generate an evaluation form');
      return;
    }

    // Clicking the button blurs a name being typed, but save it regardless.
    saveEvaluation({ coachName, assistantCoach });
    setIsGenerating(true);
    try {
      const evalPlayers = players.map((p) => {
        return {
          name: p.name,
          number: p.number,
          // Unrated stays blank: a 3 here would tell the league "Average"
          // about a player the coach never judged.
          rating: p.overallRating ?? null,
          comment: p.comments || '',
        };
      });

      const { undrawableNames, leftOffNames } = await generateEvaluationPdf({
        coachName,
        assistantCoach,
        division,
        gender,
        players: evalPlayers,
      });

      const problems = [];
      if (leftOffNames && leftOffNames.length > 0) {
        problems.push(`The form has room for ${EVALUATION_FORM_SLOTS} players, so ${leftOffNames.join(', ')} ${leftOffNames.length === 1 ? 'is' : 'are'} not on it. Please add them to a second form by hand.`);
      }
      if (undrawableNames && undrawableNames.length > 0) {
        problems.push(`The following names could not be printed: ${undrawableNames.join(', ')}. Please write them in by hand.`);
      }

      if (problems.length > 0) {
        const msg = `Note: ${problems.join(' ')}`;
        showNotification(msg, 'warning');
        toast.warning(msg);
      } else {
        showNotification('Player evaluation form generated successfully!', 'success');
        toast.success('Player evaluation form generated successfully!');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate evaluation form PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const unratedCount = players.filter((p) => p.overallRating == null).length;
  const overflowCount = Math.max(0, players.length - EVALUATION_FORM_SLOTS);

  return (
    <div className="space-y-6">
      <SaveStatus status={status} />

      {/* Form Details Card */}
      <Card className="shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-semibold">
            Coach & Team Information
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fill in the details for the AYSO Player Evaluation Form
          </p>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="coachName" className="text-xs text-muted-foreground">
                Coach Name:
              </Label>
              <Input
                type="text"
                id="coachName"
                placeholder="Enter coach name"
                value={coachName}
                maxLength={EVALUATION_NAME_MAX}
                onChange={(e) => setCoachName(e.target.value)}
                onBlur={() => saveEvaluation({ coachName })}
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assistantCoach" className="text-xs text-muted-foreground">
                Assistant Coach:
              </Label>
              <Input
                type="text"
                id="assistantCoach"
                placeholder="Enter assistant coach name"
                value={assistantCoach}
                maxLength={EVALUATION_NAME_MAX}
                onChange={(e) => setAssistantCoach(e.target.value)}
                onBlur={() => saveEvaluation({ assistantCoach })}
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="division" className="text-xs text-muted-foreground">
                Division:
              </Label>
              <select
                id="division"
                value={division}
                onChange={(e) => saveEvaluation({ division: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer"
              >
                {EVALUATION_DIVISIONS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gender" className="text-xs text-muted-foreground">
                Gender:
              </Label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => saveEvaluation({ gender: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer"
              >
                {EVALUATION_GENDERS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ratings & Comments List */}
      <Card className="shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-sm font-semibold">Player Ratings & Comments</CardTitle>
          <div className="text-[11px] text-muted-foreground">
            <strong>Scale:</strong> 1=Limited | 2=Fair | 3=Average | 4=Accomplished | 5=Excellent
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {players.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground evaluation-empty">
              No players added yet. Add players in the Lineup tab to evaluate them.
            </div>
          ) : (
            <div className="divide-y divide-border" id="evaluationPlayerList">
              {players.map((player, idx) => {
                const currentRating = player.overallRating != null ? String(player.overallRating) : '';

                return (
                  <div
                    key={player.name || idx}
                    className="evaluation-player-item p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-[160px]">
                      {player.number != null && (
                        <span className="text-xs font-bold text-muted-foreground">
                          #{player.number}
                        </span>
                      )}
                      <span className="text-sm font-medium text-foreground">
                        {player.name}
                      </span>
                    </div>

                    <div className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`rating-${idx}`} className="text-xs text-muted-foreground whitespace-nowrap">
                          Rating:
                        </Label>
                        <select
                          id={`rating-${idx}`}
                          aria-label={`Rating for ${player.name}`}
                          value={currentRating}
                          onChange={(e) => handleRatingChange(idx, e.target.value)}
                          className="flex h-8 w-20 rounded-md border border-input bg-card px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground cursor-pointer"
                        >
                          <option value="">-</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                        </select>
                      </div>

                      <div className="flex-1 min-w-[200px]">
                        <CommentInput
                          player={player}
                          idx={idx}
                          onCommit={handleCommentChange}
                          onEditingChange={handleEditingChange}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate PDF Button */}
      <div className="flex flex-col items-center sm:items-start gap-2 pt-2">
        <Button
          type="button"
          size="default"
          id="generateEvaluation"
          onClick={handleGeneratePDF}
          disabled={isGenerating || players.length === 0}
          className="flex items-center gap-2"
        >
          {isGenerating ? (
            <Sparkles className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          <span>{isGenerating ? 'Generating PDF...' : 'Generate Evaluation Form (PDF)'}</span>
        </Button>
        <p className="text-xs text-muted-foreground">
          Players will be automatically sorted alphabetically by last name in the AYSO PDF template.
        </p>
        {unratedCount > 0 && (
          <p className="text-xs text-muted-foreground" id="evaluationUnratedNote">
            {unratedCount === 1 ? '1 player has' : `${unratedCount} players have`} no rating yet; the rating box will be left blank.
          </p>
        )}
        {overflowCount > 0 && (
          <p className="text-xs text-warning" id="evaluationOverflowNote">
            The form has room for {EVALUATION_FORM_SLOTS} players; the last {overflowCount} by last name will not fit.
          </p>
        )}
      </div>
    </div>
  );
}
