import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dir, '../../migrations');

/** In-memory SQLite with every committed D1 migration applied, so tests always match the real schema. */
export function createTestDb() {
    const sqlite = new Database(':memory:');
    for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        for (const statement of sql.split('--> statement-breakpoint')) {
            if (statement.trim()) sqlite.exec(statement);
        }
    }
    // Drizzle's D1 and bun-sqlite drivers share the query-builder surface used by src/lib.
    return { sqlite, db: drizzle(sqlite) as any };
}
