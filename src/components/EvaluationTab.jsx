import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Sparkles } from 'lucide-react';
import { generateEvaluationPdf } from '@/modules/evaluation-pdf';
import { showNotification } from '@/modules/notifications';
import { toast } from 'sonner';

export function EvaluationTab({ players = [], onUpdatePlayer }) {
  const [coachName, setCoachName] = useState('');
  const [assistantCoach, setAssistantCoach] = useState('');
  const [division, setDivision] = useState('U10');
  const [gender, setGender] = useState('Boys');
  const [isGenerating, setIsGenerating] = useState(false);

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

    setIsGenerating(true);
    try {
      const evalPlayers = players.map((p) => {
        return {
          name: p.name,
          number: p.number,
          rating: p.overallRating || 3,
          comment: p.comments || '',
        };
      });

      const { undrawableNames } = await generateEvaluationPdf({
        coachName,
        assistantCoach,
        division,
        gender,
        players: evalPlayers,
      });

      if (undrawableNames && undrawableNames.length > 0) {
        const msg = `Note: The following names could not be printed: ${undrawableNames.join(', ')}. Please write them in by hand.`;
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

  return (
    <div className="space-y-6">
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
                onChange={(e) => setCoachName(e.target.value)}
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
                onChange={(e) => setAssistantCoach(e.target.value)}
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
                onChange={(e) => setDivision(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer"
              >
                <option value="U6">U6</option>
                <option value="U8">U8</option>
                <option value="U10">U10</option>
                <option value="U12">U12</option>
                <option value="U14">U14</option>
                <option value="U16">U16</option>
                <option value="U19">U19</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gender" className="text-xs text-muted-foreground">
                Gender:
              </Label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer"
              >
                <option value="Boys">Boys</option>
                <option value="Girls">Girls</option>
                <option value="Coed">Coed</option>
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
              No players added yet. Add players in the Roster section to evaluate them.
            </div>
          ) : (
            <div className="divide-y divide-border" id="evaluationPlayerList">
              {players.map((player, idx) => {
                const currentRating = player.overallRating != null ? String(player.overallRating) : '';
                const currentComments = player.comments || '';

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
                        <Input
                          type="text"
                          id={`comment-${idx}`}
                          aria-label={`Comments for ${player.name}`}
                          placeholder="Coach comments (strengths, growth areas...)"
                          maxLength={50}
                          value={currentComments}
                          onChange={(e) => handleCommentChange(idx, e.target.value)}
                          onBlur={(e) => handleCommentChange(idx, e.target.value)}
                          className="h-8 text-xs"
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
      </div>
    </div>
  );
}
