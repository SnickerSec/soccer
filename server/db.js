/**
 * Database connection pool
 */

import pg from 'pg';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
    console.error('Unexpected pool error:', err);
});

export default pool;
