-- Up Migration

-- How this team plays: the formation, how many take the field, how many
-- quarters. It lived in localStorage, so a coach who opened the app on their
-- phone at the field got 7v7 and 2-3-1 no matter what the laptop was set to.
--
-- It belongs to the team rather than the coach: two coaches sharing a 12U side
-- want the same 9v9 formation, and a coach running two teams wants each to
-- keep its own. user_settings.default_settings, which migration wrote once and
-- nothing ever read, was neither.
--
-- The age division stays in its own column: the team list and team creation
-- already read it, and a second copy inside the JSONB would be a second answer
-- to the same question.
ALTER TABLE teams ADD COLUMN settings JSONB NOT NULL DEFAULT '{}';

-- Down Migration

ALTER TABLE teams DROP COLUMN settings;
