import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  MapPin,
  Shirt,
  Cookie,
  Apple,
  Flag,
  Wrench,
  FileText,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

const JERSEY_COLOR_PRESETS = [
  { name: 'Royal Blue', class: 'bg-blue-600 text-white' },
  { name: 'White', class: 'bg-slate-100 text-slate-900 border border-slate-300' },
  { name: 'Red', class: 'bg-red-600 text-white' },
  { name: 'Navy', class: 'bg-sky-950 text-white' },
  { name: 'Gold/Yellow', class: 'bg-amber-400 text-slate-950' },
  { name: 'Green', class: 'bg-emerald-600 text-white' },
  { name: 'Orange', class: 'bg-orange-500 text-white' },
];

export function FixtureModal({
  isOpen,
  onClose,
  fixture = null,
  players = [],
  onSave,
}) {
  const [gameDate, setGameDate] = useState('');
  const [gameTime, setGameTime] = useState('09:00');
  const [opponent, setOpponent] = useState('');
  const [homeAway, setHomeAway] = useState('home');
  const [location, setLocation] = useState('');
  const [jerseyColor, setJerseyColor] = useState('Royal Blue');
  const [snackParent, setSnackParent] = useState('');
  const [fruitParent, setFruitParent] = useState('');
  const [refereeDuty, setRefereeDuty] = useState('');
  const [fieldSetup, setFieldSetup] = useState('');
  const [status, setStatus] = useState('upcoming');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (fixture) {
      setGameDate(fixture.gameDate || '');
      setGameTime(fixture.gameTime || '09:00');
      setOpponent(fixture.opponent || '');
      setHomeAway(fixture.homeAway || 'home');
      setLocation(fixture.location || '');
      setJerseyColor(fixture.jerseyColor || 'Royal Blue');
      setSnackParent(fixture.snackParent || '');
      setFruitParent(fixture.fruitParent || '');
      setRefereeDuty(fixture.refereeDuty || '');
      setFieldSetup(fixture.fieldSetup || '');
      setStatus(fixture.status || 'upcoming');
      setNotes(fixture.notes || '');
    } else {
      // Default to next Saturday
      const today = new Date();
      const nextSat = new Date();
      nextSat.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
      const dateStr = nextSat.toISOString().split('T')[0];

      setGameDate(dateStr);
      setGameTime('09:00');
      setOpponent('');
      setHomeAway('home');
      setLocation('');
      setJerseyColor('Royal Blue');
      setSnackParent('');
      setFruitParent('');
      setRefereeDuty('');
      setFieldSetup('');
      setStatus('upcoming');
      setNotes('');
    }
  }, [fixture, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!opponent.trim()) {
      toast.error('Please provide an opponent name.');
      return;
    }
    if (!gameDate) {
      toast.error('Please select a match date.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...(fixture ? { id: fixture.id } : {}),
        gameDate,
        gameTime: gameTime.trim(),
        opponent: opponent.trim(),
        homeAway,
        location: location.trim(),
        jerseyColor: jerseyColor.trim(),
        snackParent: snackParent.trim(),
        fruitParent: fruitParent.trim(),
        refereeDuty: refereeDuty.trim(),
        fieldSetup: fieldSetup.trim(),
        status,
        notes: notes.trim(),
      };

      await onSave(payload);
      toast.success(fixture ? 'Match updated successfully!' : 'Match scheduled successfully!');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save match');
    } finally {
      setIsSubmitting(false);
    }
  };

  const playerNames = (players || []).map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Calendar className="h-5 w-5 text-primary" />
            {fixture ? 'Edit Match Fixture' : 'Schedule New Match'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Opponent & Home/Away */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="opponentName" className="text-xs font-semibold">
                Opponent Team Name *
              </Label>
              <Input
                id="opponentName"
                placeholder="e.g., Strikers, Thunder FC, Blue Dragons"
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                required
                className="text-sm font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Match Type</Label>
              <div className="flex rounded-md border p-0.5 bg-muted">
                <button
                  type="button"
                  onClick={() => setHomeAway('home')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
                    homeAway === 'home'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🏠 Home
                </button>
                <button
                  type="button"
                  onClick={() => setHomeAway('away')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
                    homeAway === 'away'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  ✈️ Away
                </button>
              </div>
            </div>
          </div>

          {/* Date & Kickoff Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gameDate" className="text-xs font-semibold flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Match Date *
              </Label>
              <Input
                id="gameDate"
                type="date"
                value={gameDate}
                onChange={(e) => setGameDate(e.target.value)}
                required
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gameTime" className="text-xs font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Kickoff Time
              </Label>
              <Input
                id="gameTime"
                type="time"
                value={gameTime}
                onChange={(e) => setGameTime(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* Field Location */}
          <div className="space-y-1.5">
            <Label htmlFor="location" className="text-xs font-semibold flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Field / Park Location
            </Label>
            <Input
              id="location"
              placeholder="e.g., Kaneohe District Park - Field 2, Kapiolani Pitch A"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Jersey Color & Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="jerseyColor" className="text-xs font-semibold flex items-center gap-1.5">
                <Shirt className="h-3.5 w-3.5 text-muted-foreground" /> Team Jersey Color
              </Label>
              <span className="text-[11px] text-muted-foreground">Quick select:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {JERSEY_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setJerseyColor(preset.name)}
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition-all ${preset.class} ${
                    jerseyColor === preset.name ? 'ring-2 ring-primary ring-offset-1 scale-105' : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <Input
              id="jerseyColor"
              placeholder="e.g., Royal Blue (Home), White (Away)"
              value={jerseyColor}
              onChange={(e) => setJerseyColor(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Volunteer Assignments Box */}
          <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                <Users className="h-4 w-4 text-primary" /> Family Volunteer Duties
              </span>
              <span className="text-[11px] text-muted-foreground">Assign families from roster</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Post-game snack */}
              <div className="space-y-1">
                <Label htmlFor="snackParent" className="text-xs font-medium flex items-center gap-1">
                  <Cookie className="h-3.5 w-3.5 text-amber-500" /> Post-Game Snack
                </Label>
                <div className="relative">
                  <Input
                    id="snackParent"
                    list="playerSuggestions"
                    placeholder="Parent / Player Name"
                    value={snackParent}
                    onChange={(e) => setSnackParent(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              </div>

              {/* Halftime Fruit */}
              <div className="space-y-1">
                <Label htmlFor="fruitParent" className="text-xs font-medium flex items-center gap-1">
                  <Apple className="h-3.5 w-3.5 text-orange-500" /> Halftime Fruit / Oranges
                </Label>
                <div className="relative">
                  <Input
                    id="fruitParent"
                    list="playerSuggestions"
                    placeholder="Parent / Player Name"
                    value={fruitParent}
                    onChange={(e) => setFruitParent(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              </div>

              {/* Referee Duty */}
              <div className="space-y-1">
                <Label htmlFor="refereeDuty" className="text-xs font-medium flex items-center gap-1">
                  <Flag className="h-3.5 w-3.5 text-emerald-500" /> Referee / Linesperson
                </Label>
                <div className="relative">
                  <Input
                    id="refereeDuty"
                    list="playerSuggestions"
                    placeholder="Volunteer Name"
                    value={refereeDuty}
                    onChange={(e) => setRefereeDuty(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              </div>

              {/* Field Setup */}
              <div className="space-y-1">
                <Label htmlFor="fieldSetup" className="text-xs font-medium flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5 text-blue-500" /> Field Setup / Flags
                </Label>
                <div className="relative">
                  <Input
                    id="fieldSetup"
                    list="playerSuggestions"
                    placeholder="Volunteer Name"
                    value={fieldSetup}
                    onChange={(e) => setFieldSetup(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              </div>
            </div>

            {/* Datalist for player suggestions */}
            <datalist id="playerSuggestions">
              {playerNames.map((name) => (
                <option key={name} value={`${name}'s Family`} />
              ))}
              {playerNames.map((name) => (
                <option key={`p-${name}`} value={name} />
              ))}
            </datalist>
          </div>

          {/* Coach Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="matchNotes" className="text-xs font-semibold flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Coach Notes & Parent Instructions
            </Label>
            <textarea
              id="matchNotes"
              rows={2}
              placeholder="e.g., Arrive 25 minutes early for warmups. Lower parking lot has extra spots."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Status selector */}
          {fixture && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold">Match Status</Label>
              <div className="flex gap-2">
                {['upcoming', 'completed', 'canceled'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md border transition-all ${
                      status === s
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t flex flex-row items-center justify-between sm:justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : fixture ? 'Update Match' : 'Save Match'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
