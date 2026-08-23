import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';

export function ShareLineupDialog({ isOpen, shareUrl, onClose }) {
  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied to clipboard!');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            Share Game Lineup
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <p className="text-muted-foreground">
            Anyone with this link can view this lineup in their browser without signing in:
          </p>

          <div className="flex items-center gap-2">
            <Input
              type="text"
              readOnly
              value={shareUrl || ''}
              className="text-xs font-mono h-9"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleCopy}
              className="h-9 px-3 flex items-center gap-1 shrink-0"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
