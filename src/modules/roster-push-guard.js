/**
 * Whether a roster change is a real edit worth pushing, or just the app
 * catching up with itself.
 *
 * `PUT /players` replaces a team's whole roster, so what gets pushed matters
 * more than most writes: an empty list deletes every player for every coach on
 * the team. App holds the roster in React state and pushes it from an effect,
 * and an effect fires for reasons that are not edits —
 *
 *   - a sign-in, which sets the current user one render before the pull that
 *     fills the roster in. In a browser that has never opened this origin,
 *     localStorage is empty, so the roster at that moment is `[]`.
 *   - a team switch, same shape: the team is set, then the pull is awaited.
 *   - the pull landing, which sets the roster to what the server already has.
 *
 * The first two would delete the roster. The third would push the server its
 * own roster back and bump `roster_version`, rejecting an edit another coach
 * had in flight. This is not hypothetical for the first: it is how the roster
 * was lost when the app moved to a new domain, a new origin having no
 * localStorage to read. It is also why the settings push is deliberately not
 * an effect.
 *
 * So the rule is per team: the first sight of a team is recorded and not
 * pushed, and after that only a roster that differs from the last one recorded
 * is a real edit. Clearing a roster on purpose still pushes — it differs from
 * what was recorded — which is what keeps "Clear All Players" working.
 */

/**
 * @param {{team: string, roster: string}|null} previous  what was last recorded
 * @param {{teamKey: string|null, serialized: string}} current
 * @returns {{push: boolean, next: {team: string, roster: string}|null}}
 */
export function rosterPushDecision(previous, { teamKey, serialized }) {
    // Signed out, or no team chosen: nothing to push to, and nothing to hold.
    if (!teamKey) return { push: false, next: null };

    const seen = { team: teamKey, roster: serialized };

    // First sight of this team. Whatever is in state is not known to be this
    // team's roster yet.
    if (!previous || previous.team !== teamKey) return { push: false, next: seen };

    // Unchanged since the last thing recorded — a pull, or a re-render.
    if (previous.roster === serialized) return { push: false, next: previous };

    return { push: true, next: seen };
}
