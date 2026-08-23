import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getInviteInfo, acceptInvite } from '@/modules/team-manager';
import { toast } from 'sonner';

export function InviteModal({ isOpen, token, onClose, onInviteAccepted }) {
  const [inviteData, setInviteData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    if (isOpen && token) {
      setIsLoading(true);
      getInviteInfo(token)
        .then((res) => {
          if (res.success && res.data) {
            setInviteData(res.data);
          } else {
            toast.error(res.error || 'Invalid or expired invite');
            onClose();
          }
        })
        .catch(() => {
          toast.error('Failed to load invitation info');
          onClose();
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, token]);

  if (!isOpen || !token) return null;

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      const res = await acceptInvite(token);
      if (res.success) {
        toast.success(`Joined ${inviteData?.team?.name || 'team'} successfully!`);
        onInviteAccepted(res.data?.teamId);
        onClose();
      } else {
        toast.error(res.error || 'Failed to accept invitation');
      }
    } catch (e) {
      toast.error('Failed to accept invitation');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" id="inviteModal">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Team Invitation</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Loading invitation details...
          </div>
        ) : inviteData ? (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground" id="inviteMessage">
              You've been invited to join a soccer team.
            </p>

            <div className="p-3 rounded-lg border bg-muted/40 text-xs space-y-1.5" id="inviteDetails">
              <p>
                <strong className="text-foreground">Team:</strong>{' '}
                <span id="inviteTeamName">{inviteData.team?.name || 'Soccer Team'}</span>
              </p>
              <p>
                <strong className="text-foreground">Role:</strong>{' '}
                <span id="inviteRoleName" className="capitalize">{inviteData.role || 'Coach'}</span>
              </p>
              {inviteData.invitedBy && (
                <p>
                  <strong className="text-foreground">Invited by:</strong>{' '}
                  <span id="inviteByName">{inviteData.invitedBy.displayName || inviteData.invitedBy.email}</span>
                </p>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                id="declineInvite"
                onClick={onClose}
                className="text-xs"
              >
                Decline
              </Button>
              <Button
                type="button"
                size="sm"
                id="acceptInvite"
                onClick={handleAccept}
                disabled={isAccepting}
                className="text-xs"
              >
                {isAccepting ? 'Accepting...' : 'Accept Invitation'}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
