import React from 'react';
import { Button } from '@/components/ui/button';
import { Link2 } from 'lucide-react';

/**
 * Says that the lineup on screen came in a link, and is the way back.
 *
 * Opening a share link used to load its roster, captains and formation as the
 * device's own, and save them — so a coach who tapped another team's link
 * had their roster replaced, and signed out there was no other copy. The
 * shared lineup is shown on its own now, and this is what says so.
 */
export function SharedLineupNotice({ teamName, onClose }) {
  return (
    <div
      id="sharedLineupNotice"
      role="status"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4"
    >
      <div className="flex items-start gap-2 text-sm">
        <Link2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          <span className="font-semibold">
            Viewing a shared lineup{teamName ? ` from ${teamName}` : ''}.
          </span>{' '}
          <span className="text-muted-foreground">Your own roster and lineup have not changed.</span>
        </p>
      </div>
      <Button type="button" size="sm" id="closeSharedLineup" onClick={onClose} className="shrink-0">
        Close shared lineup
      </Button>
    </div>
  );
}
