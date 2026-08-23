import React from 'react';

export function Footer() {
  return (
    <footer className="border-t bg-card mt-12 px-4 py-8 text-center text-xs text-muted-foreground space-y-2">
      <p>
        <a
          href="https://ayso.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-semibold"
        >
          AYSO
        </a>{' '}
        Core Program: 10U–19U Support | Fair Play &amp; Everyone Plays Philosophy
      </p>
      <p>
        <strong>Formats:</strong> 10U (7v7) | 12U (9v9) | 14U–19U (11v11) |{' '}
        <strong>Heading:</strong> Not allowed 10U–12U, Permitted 14U+
      </p>
      <p>All players must play at least 50% of every game | Balanced teams | Positive coaching</p>
      <p className="pt-2 text-[11px] opacity-80">
        Privacy First: Works offline, data stays local | Optional cloud sync to share with co-coaches |{' '}
        <a href="/privacy.html" className="underline hover:text-foreground">
          Privacy &amp; Safety
        </a>
      </p>
    </footer>
  );
}
