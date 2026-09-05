import React from 'react';

/**
 * The last thing between a component throwing and the coach seeing nothing.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which is not a crash the coach can read: the app goes white, mid-match, with
 * no way back short of knowing to reload. A stale reference in TeamModal did
 * exactly that to every owner who opened the create-team form.
 *
 * The roster, the schedule and the season history are in local storage, so a
 * reload loses nothing — the point of this is to say so, and give them the
 * button.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        id="errorBoundary"
        role="alert"
        className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground"
      >
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your roster, schedule and season history are saved on this device.
          Reloading will not lose them.
        </p>
        <button
          type="button"
          id="errorBoundaryReload"
          onClick={() => window.location.reload()}
          className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Reload the app
        </button>
        <p className="max-w-sm break-words text-xs text-muted-foreground/70">
          {String(this.state.error?.message || this.state.error)}
        </p>
      </div>
    );
  }
}
