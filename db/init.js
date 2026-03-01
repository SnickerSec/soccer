/**
 * Database initialization script
 * Reads schema.sql and executes it against DATABASE_URL
 *
 * Usage: DATABASE_URL=postgres://... node db/init.js
 */

import { readFileSync } from 'fs';
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

async function init() {
    const client = new pg.Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
        await client.query(schema);

        console.log('Schema applied successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

init();
