-- Up Migration

-- A saved game's player_snapshot copied the whole roster row, evaluation
-- comment included. A game is history that nothing rewrites, so a comment the
-- coach later cleared or reworded lived on in every game saved meanwhile. The
-- roster holds the comment now and the snapshot leaves it out; this removes
-- the copies already saved. Element order is kept, since it is roster order.
UPDATE games
   SET player_snapshot = (
           SELECT jsonb_agg(CASE WHEN jsonb_typeof(elem) = 'object' THEN elem - 'comments' ELSE elem END
                            ORDER BY ord)
             FROM jsonb_array_elements(player_snapshot) WITH ORDINALITY AS t(elem, ord)
       )
 WHERE jsonb_typeof(player_snapshot) = 'array'
   AND EXISTS (
           SELECT 1
             FROM jsonb_array_elements(player_snapshot) AS e(elem)
            WHERE jsonb_typeof(elem) = 'object' AND elem ? 'comments'
       );

-- Down Migration

-- Nothing to restore: the comments were copies, and the roster keeps its own.
