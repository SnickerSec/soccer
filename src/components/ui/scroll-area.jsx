import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

/*
 * The viewport is sized by flexbox, not by `h-full`.
 *
 * `h-full` is `height: 100%`, and a percentage height only resolves against a
 * containing block with a *definite* height. Every dialog here is
 * `max-h-[90vh]` with no height of its own, so the whole chain down to the
 * viewport is content-driven and merely capped — indefinite. The percentage
 * therefore fell back to `auto`, the viewport grew to its full content height
 * inside a Root that was `overflow-hidden`, and `scrollHeight === clientHeight`:
 * the content was clipped and could not be scrolled to at all. Measured in the
 * edit-game dialog: a 1434px viewport in a 576px box, scrollTop pinned at 0.
 *
 * `flex-auto` is `flex: 1 1 auto` — basis `auto`, so the viewport still reports
 * its content height when nothing constrains the Root (the horizontal
 * `w-full` uses would collapse to zero on a `basis-0` `flex-1`), and `min-h-0`
 * lets it shrink below that when something does. Both come out of the flex
 * algorithm's used sizes, which need no definite ancestor.
 */
const ScrollArea = React.forwardRef(
  ({ className, children, ...props }, ref) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn("relative flex flex-col overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="w-full min-h-0 flex-auto rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
);
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef(
  ({ className, orientation = "vertical", ...props }, ref) => (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        "flex touch-none select-none transition-colors",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent p-[1px]",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent p-[1px]",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border hover:bg-muted-foreground/40 transition-colors" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
);
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
