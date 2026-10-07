import type { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { settings } from '../db/schema';

type DB = ReturnType<typeof drizzle>;

export async function getSetting<T>(db: DB, key: string, fallback: T): Promise<T> {
    const row = await db.select().from(settings).where(eq(settings.key, key)).get();
    return row ? (row.value as T) : fallback;
}

export async function getSettings(db: DB): Promise<Record<string, unknown>> {
    const rows = await db.select().from(settings).all();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function setSetting(db: DB, key: string, value: unknown, userId?: number): Promise<void> {
    await db.insert(settings)
        .values({ key, value: value as never, updatedAt: new Date(), updatedByUserId: userId ?? null })
        .onConflictDoUpdate({
            target: settings.key,
            set: { value: value as never, updatedAt: new Date(), updatedByUserId: userId ?? null },
        });
}
