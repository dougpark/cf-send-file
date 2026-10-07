import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { activityLogs, ACTIVITY_LOG_CATEGORIES } from '../db/schema';
import { DEFAULT_ADMIN_EMAIL, DEFAULT_OPEN_SIGNUP, DEFAULT_SITE_NAME, SETTING_KEYS } from './config';
import { getSetting } from './settings';
import type { MailContext } from './email';
import type { AppEnv } from '../middleware/auth';

export type DB = ReturnType<typeof drizzle>;
export type AppContext = Context<AppEnv>;

export const getDb = (c: AppContext): DB => drizzle(c.env.DB);

export async function getSiteSettings(db: DB) {
    const [siteName, adminEmail, openSignup] = await Promise.all([
        getSetting(db, SETTING_KEYS.siteName, DEFAULT_SITE_NAME),
        getSetting(db, SETTING_KEYS.adminEmail, DEFAULT_ADMIN_EMAIL),
        getSetting(db, SETTING_KEYS.openSignup, DEFAULT_OPEN_SIGNUP),
    ]);
    return { siteName, adminEmail, openSignup: Boolean(openSignup) };
}

export async function mailContext(c: AppContext, db: DB): Promise<MailContext> {
    const { siteName, adminEmail } = await getSiteSettings(db);
    return { binding: c.env.EMAIL, from: c.env.MAIL_FROM, adminEmail, siteName, origin: new URL(c.req.url).origin };
}

export async function logActivity(
    db: DB,
    entry: {
        category: (typeof ACTIVITY_LOG_CATEGORIES)[number];
        action: string;
        actorUserId?: number | null;
        targetUserId?: number | null;
        details?: Record<string, unknown>;
    },
) {
    await db.insert(activityLogs).values({
        category: entry.category,
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        targetUserId: entry.targetUserId ?? null,
        details: entry.details ? JSON.stringify(entry.details) : null,
    });
}

export function parseId(value: string | undefined): number | null {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
