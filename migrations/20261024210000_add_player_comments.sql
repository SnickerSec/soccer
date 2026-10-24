-- Up Migration

-- The coach's comment on the player evaluation form. It lived on the device
-- only, and since a pull replaces the local roster with the server's, a
-- signed-in coach lost every comment at the next sync.
--
-- Nullable on purpose: NULL is what a build that does not know about comments
-- sends, and the upsert keeps the stored comment rather than blanking it. An
-- empty string is a comment deliberately cleared.
ALTER TABLE players ADD COLUMN comments TEXT
    CHECK (comments IS NULL OR char_length(comments) <= 500);

-- Down Migration

ALTER TABLE players DROP COLUMN comments;
