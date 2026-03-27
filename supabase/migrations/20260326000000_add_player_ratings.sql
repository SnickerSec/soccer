-- Add player ratings columns
-- overall_rating: 1-5 scale overall skill level
-- positional_ratings: JSONB with keeper/defense/midfield/offense ratings (each 1-5)

ALTER TABLE players
    ADD COLUMN overall_rating INTEGER DEFAULT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
    ADD COLUMN positional_ratings JSONB DEFAULT '{}';
