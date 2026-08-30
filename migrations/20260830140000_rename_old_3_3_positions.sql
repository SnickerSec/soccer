-- Up Migration

-- The 3-3 was three backs behind a midfield three until it was redefined as
-- three backs and three forwards, and the middle line was renamed with it:
--
--   Left Mid -> Left Forward,  Center Mid -> Striker,  Right Mid -> Right Forward
--
-- Games saved before that still hold the old names inside `lineup` and
-- `player_snapshot`. The client reads them under their current names already,
-- so nothing is broken on screen; this moves the stored rows to match, so the
-- data says what the app says and the read-time mapping is a fallback for
-- local-only games rather than the only thing holding it together.
--
-- The 6v6 3-3 lost its Right Mid rather than its Center Mid, so its Center Mid
-- became the Right Forward. A game that never recorded fieldPlayers is treated
-- as 7v7, which is what every 3-3 in the wild is.
--
-- Only games whose formation is 3-3 are touched, so a Center Mid in a 2-3-1 is
-- left alone. Re-running is harmless: 'Left Forward' matches nothing in the
-- CASE and the WHERE clause stops matching once a game is converted.

DO $$
DECLARE
    game_row RECORD;
    striker TEXT;
    rebuilt_lineup JSONB;
    rebuilt_snapshot JSONB;
BEGIN
    FOR game_row IN
        SELECT id,
               lineup,
               player_snapshot,
               COALESCE(NULLIF(settings->>'fieldPlayers', '')::INT, 7) AS field_players
        FROM games
        WHERE settings->>'formation' = '3-3'
          AND (lineup::TEXT LIKE '%Mid%' OR player_snapshot::TEXT LIKE '%Mid%')
    LOOP
        striker := CASE WHEN game_row.field_players = 6 THEN 'Right Forward' ELSE 'Striker' END;

        -- Each quarter keeps its shape; only the keys of `positions` move.
        IF jsonb_typeof(game_row.lineup) = 'array' THEN
            SELECT jsonb_agg(
                       CASE
                           WHEN quarter ? 'positions' AND jsonb_typeof(quarter->'positions') = 'object'
                           THEN quarter || jsonb_build_object('positions', (
                               SELECT COALESCE(jsonb_object_agg(
                                          CASE slot
                                              WHEN 'Left Mid'   THEN 'Left Forward'
                                              WHEN 'Right Mid'  THEN 'Right Forward'
                                              WHEN 'Center Mid' THEN striker
                                              ELSE slot
                                          END,
                                          occupant
                                      ), '{}'::JSONB)
                               FROM jsonb_each(quarter->'positions') AS slots(slot, occupant)
                           ))
                           ELSE quarter
                       END
                       ORDER BY quarter_index
                   )
              INTO rebuilt_lineup
              FROM jsonb_array_elements(game_row.lineup)
                   WITH ORDINALITY AS quarters(quarter, quarter_index);
        ELSE
            rebuilt_lineup := game_row.lineup;
        END IF;

        -- Each player keeps their row; only positionsPlayed[].position moves.
        IF jsonb_typeof(game_row.player_snapshot) = 'array' THEN
            SELECT jsonb_agg(
                       CASE
                           WHEN player ? 'positionsPlayed'
                                AND jsonb_typeof(player->'positionsPlayed') = 'array'
                           THEN player || jsonb_build_object('positionsPlayed', (
                               SELECT COALESCE(jsonb_agg(
                                          CASE
                                              WHEN played ? 'position'
                                              THEN played || jsonb_build_object('position',
                                                       CASE played->>'position'
                                                           WHEN 'Left Mid'   THEN 'Left Forward'
                                                           WHEN 'Right Mid'  THEN 'Right Forward'
                                                           WHEN 'Center Mid' THEN striker
                                                           ELSE played->>'position'
                                                       END)
                                              ELSE played
                                          END
                                          ORDER BY played_index
                                      ), '[]'::JSONB)
                               FROM jsonb_array_elements(player->'positionsPlayed')
                                    WITH ORDINALITY AS positions_played(played, played_index)
                           ))
                           ELSE player
                       END
                       ORDER BY player_index
                   )
              INTO rebuilt_snapshot
              FROM jsonb_array_elements(game_row.player_snapshot)
                   WITH ORDINALITY AS snapshot(player, player_index);
        ELSE
            rebuilt_snapshot := game_row.player_snapshot;
        END IF;

        UPDATE games
           SET lineup = COALESCE(rebuilt_lineup, lineup),
               player_snapshot = COALESCE(rebuilt_snapshot, player_snapshot)
         WHERE id = game_row.id;
    END LOOP;
END $$;

-- Down Migration

-- Deliberately a no-op. Renaming forwards back to mids cannot be limited to the
-- games this migration touched: a 3-3 saved after it holds Left Forward,
-- Striker and Right Forward legitimately, and reversing would rewrite those
-- into a midfield line the formation does not have. The client still reads the
-- old names correctly, so leaving the data converted costs nothing.

SELECT 1;
