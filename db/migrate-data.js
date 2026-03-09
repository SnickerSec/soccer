/**
 * Data migration script: Supabase → Railway PostgreSQL
 *
 * Exports data from Supabase JSON dumps and imports into the new Railway database.
 * Place exported JSON files in db/export/ directory before running.
 *
 * Usage: DATABASE_URL=postgres://... node db/migrate-data.js
 *
 * Expected files in db/export/:
 *   profiles.json, teams.json, team_members.json, players.json, games.json, user_settings.json
 *
 * Notes:
 * - Profiles are inserted preserving original UUIDs with google_id = NULL
 * - On first Google OAuth login, Passport callback matches by email and backfills google_id
 * - All other tables are inserted as-is (foreign keys remain valid)
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
}

function loadJSON(filename) {
    const filePath = path.join(__dirname, 'export', path.basename(filename));
    if (!existsSync(filePath)) {
        console.log(`  Skipping ${filename} (not found)`);
        return [];
    }
    return JSON.parse(readFileSync(filePath, 'utf-8'));
}

async function migrate() {
    const client = new pg.Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database\n');

        // 1. Profiles
        const profiles = loadJSON('profiles.json');
        if (profiles.length > 0) {
            console.log(`Migrating ${profiles.length} profiles...`);
            for (const p of profiles) {
                await client.query(
                    `INSERT INTO profiles (id, google_id, email, display_name, avatar_url, created_at, updated_at)
                     VALUES ($1, NULL, $2, $3, $4, $5, $6)
                     ON CONFLICT (id) DO NOTHING`,
                    [p.id, p.email, p.display_name, p.avatar_url, p.created_at, p.updated_at]
                );
            }
            console.log('  Done.\n');
        }

        // 2. Teams
        const teams = loadJSON('teams.json');
        if (teams.length > 0) {
            console.log(`Migrating ${teams.length} teams...`);
            for (const t of teams) {
                await client.query(
                    `INSERT INTO teams (id, name, age_division, created_by, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (id) DO NOTHING`,
                    [t.id, t.name, t.age_division, t.created_by, t.created_at, t.updated_at]
                );
            }
            console.log('  Done.\n');
        }

        // 3. Team members
        const teamMembers = loadJSON('team_members.json');
        if (teamMembers.length > 0) {
            console.log(`Migrating ${teamMembers.length} team members...`);
            for (const tm of teamMembers) {
                await client.query(
                    `INSERT INTO team_members (id, team_id, user_id, role, invited_by, invited_at, joined_at, invite_token, invite_expires_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     ON CONFLICT (team_id, user_id) DO NOTHING`,
                    [tm.id, tm.team_id, tm.user_id, tm.role, tm.invited_by, tm.invited_at, tm.joined_at, tm.invite_token, tm.invite_expires_at]
                );
            }
            console.log('  Done.\n');
        }

        // 4. Players
        const players = loadJSON('players.json');
        if (players.length > 0) {
            console.log(`Migrating ${players.length} players...`);
            for (const p of players) {
                await client.query(
                    `INSERT INTO players (id, team_id, name, number, is_captain, must_rest, no_keeper, status, preferred_positions, sort_order, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                     ON CONFLICT (id) DO NOTHING`,
                    [p.id, p.team_id, p.name, p.number, p.is_captain, p.must_rest, p.no_keeper, p.status, p.preferred_positions, p.sort_order, p.created_at, p.updated_at]
                );
            }
            console.log('  Done.\n');
        }

        // 5. Games
        const games = loadJSON('games.json');
        if (games.length > 0) {
            console.log(`Migrating ${games.length} games...`);
            for (const g of games) {
                await client.query(
                    `INSERT INTO games (id, team_id, name, game_date, notes, settings, lineup, player_snapshot, captains, created_by, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                     ON CONFLICT (id) DO NOTHING`,
                    [g.id, g.team_id, g.name, g.game_date, g.notes, JSON.stringify(g.settings), JSON.stringify(g.lineup), JSON.stringify(g.player_snapshot), g.captains, g.created_by, g.created_at, g.updated_at]
                );
            }
            console.log('  Done.\n');
        }

        // 6. User settings
        const userSettings = loadJSON('user_settings.json');
        if (userSettings.length > 0) {
            console.log(`Migrating ${userSettings.length} user settings...`);
            for (const us of userSettings) {
                await client.query(
                    `INSERT INTO user_settings (user_id, theme, default_team_id, default_settings, updated_at)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (user_id) DO NOTHING`,
                    [us.user_id, us.theme, us.default_team_id, JSON.stringify(us.default_settings), us.updated_at]
                );
            }
            console.log('  Done.\n');
        }

        console.log('Migration completed successfully!');
        console.log('Note: Users will need to sign in with Google to backfill google_id in their profiles.');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrate();
