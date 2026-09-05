/**
 * The guard that decides whether a roster change reaches the server.
 *
 * PUT /players replaces a team's whole roster, so a push of [] deletes every
 * player for every coach. These cases are the ones that actually happened or
 * nearly did.
 */

import { describe, test, expect } from '@jest/globals';
import { rosterPushDecision } from '../src/modules/roster-push-guard.js';

const TEAM = 'user-1:team-a';
const EMPTY = JSON.stringify([]);
const ROSTER = JSON.stringify([{ name: 'Brady', number: 9 }]);

describe('rosterPushDecision', () => {
    test('a sign-in with empty local storage does not push', () => {
        // The incident: moving to a new domain gave the app a new origin, so
        // localStorage was empty and the roster in state was []. The effect
        // fired because currentUser had just been set, and the push deleted
        // the team's players before the pull had a chance to fill them in.
        const d = rosterPushDecision(null, { teamKey: TEAM, serialized: EMPTY });
        expect(d.push).toBe(false);
        expect(d.next).toEqual({ team: TEAM, roster: EMPTY });
    });

    test('the roster the pull adopts is not pushed back', () => {
        // Otherwise every sign-in writes the server its own roster and bumps
        // roster_version, rejecting an edit another coach has in flight.
        const after = rosterPushDecision(
            { team: TEAM, roster: ROSTER },
            { teamKey: TEAM, serialized: ROSTER }
        );
        expect(after.push).toBe(false);
    });

    test('switching teams does not push the team being left', () => {
        // The switch sets the new team one render before its pull lands, so
        // state still holds the previous team's roster.
        const previous = { team: 'user-1:team-b', roster: ROSTER };
        const d = rosterPushDecision(previous, { teamKey: TEAM, serialized: ROSTER });
        expect(d.push).toBe(false);
        expect(d.next).toEqual({ team: TEAM, roster: ROSTER });
    });

    test('a real edit pushes', () => {
        const edited = JSON.stringify([{ name: 'Brady', number: 10 }]);
        const d = rosterPushDecision(
            { team: TEAM, roster: ROSTER },
            { teamKey: TEAM, serialized: edited }
        );
        expect(d.push).toBe(true);
        expect(d.next).toEqual({ team: TEAM, roster: edited });
    });

    test('deliberately clearing a roster still pushes', () => {
        // "Clear All Players" has to keep working: the guard suppresses an
        // empty roster the app never loaded, not one the coach emptied.
        const d = rosterPushDecision(
            { team: TEAM, roster: ROSTER },
            { teamKey: TEAM, serialized: EMPTY }
        );
        expect(d.push).toBe(true);
    });

    test('signed out, or no team, holds nothing and pushes nothing', () => {
        const d = rosterPushDecision({ team: TEAM, roster: ROSTER }, { teamKey: null, serialized: ROSTER });
        expect(d.push).toBe(false);
        expect(d.next).toBeNull();
    });

    test('signing back in after signing out does not push the stale roster', () => {
        // next:null on sign-out means the next sign-in is a first sight again.
        const out = rosterPushDecision({ team: TEAM, roster: ROSTER }, { teamKey: null, serialized: ROSTER });
        const back = rosterPushDecision(out.next, { teamKey: TEAM, serialized: EMPTY });
        expect(back.push).toBe(false);
    });
});
