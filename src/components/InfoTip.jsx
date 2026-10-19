import React, { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

/**
 * An (i) button that explains the control beside it.
 *
 * Radix tooltips open on hover and keyboard focus only — a tap on a phone
 * closes them rather than opening them, and a phone is where this app is used.
 * So the tooltip is controlled and a click toggles it. preventDefault keeps
 * Radix's own pointerdown and click handlers, which close it, from running; a
 * tap anywhere but the trigger dismisses it through the content's
 * outside-pointer handling.
 */
export function InfoTip({ label, children, side = 'top' }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          asChild
          // On the Trigger rather than the button: Radix only skips its own
          // handler for a prevented event it composed itself, and asChild's
          // Slot runs a child's handler and Radix's both regardless. Its
          // pointerdown closes an open tooltip, so without the first of these a
          // tap on an open one closed it and the click opened it straight back.
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            // A mouse has already opened it by hovering, so a click there
            // must not be what closes it; moving away does that.
            const isMouse = e.nativeEvent.pointerType === 'mouse';
            setOpen((o) => (isMouse ? true : !o));
          }}
        >
          <button
            ref={triggerRef}
            type="button"
            aria-label={label}
            // Below md, index.css raises every button to 44x44. The negative
            // margin gives back the space that adds around a 14px icon, so it
            // sits beside its label instead of a thumb's width away from it.
            className="inline-flex items-center justify-center rounded-full max-md:-mx-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align="start"
          alignOffset={-8}
          collisionPadding={12}
          className="max-w-[min(20rem,calc(100vw-24px))] leading-relaxed"
          // The trigger is outside the content, so a tap on it would also
          // dismiss — and the click right after would reopen it. The click is
          // what toggles, so the trigger does not count as outside.
          onPointerDownOutside={(e) => {
            if (triggerRef.current?.contains(e.target)) e.preventDefault();
          }}
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
