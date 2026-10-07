import { Hono } from 'hono';
import { and, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { activityLogs, ACTIVITY_LOG_CATEGORIES, sessions, userLoginEmails, users } from '../../db/schema';
import { getDb, type DB } from '../../lib/context';
import { requireAnyAdminRole, requireAuth, type AppEnv } from '../../middleware/auth';

const adminLogs = new Hono<AppEnv>();

type Category = (typeof ACTIVITY_LOG_CATEGORIES)[number];

async function fetchActivityLogRows(db: DB, options: { category?: string; query?: string; limit?: number }) {
    const targetUsers = alias(users, 'target_users');
    const conditions: SQL[] = [];
    if (options.category && (ACTIVITY_LOG_CATEGORIES as readonly string[]).includes(options.category)) {
        conditions.push(eq(activityLogs.category, options.category as Category));
    }
    if (options.query) {
        const term = `%${options.query}%`;
        conditions.push(or(like(users.email, term), like(targetUsers.email, term), like(activityLogs.action, term))!);
    }

    return db.select({
        id: activityLogs.id,
        category: activityLogs.category,
        action: activityLogs.action,
        details: activityLogs.details,
        createdAt: activityLogs.createdAt,
        actorEmail: users.email,
        targetEmail: targetUsers.email,
    }).from(activityLogs)
        .leftJoin(users, eq(users.id, activityLogs.actorUserId))
        .leftJoin(targetUsers, eq(targetUsers.id, activityLogs.targetUserId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(activityLogs.createdAt))
        .limit(Math.min(Math.max(options.limit ?? 50, 1), 200)).all();
}

adminLogs.get('/log-viewer/logs', requireAuth(), requireAnyAdminRole(), async (c) => {
    return c.json(await fetchActivityLogRows(getDb(c), {
        category: c.req.query('category'),
        query: (c.req.query('q') ?? '').trim(),
        limit: Number(c.req.query('limit')) || 50,
    }));
});

adminLogs.get('/log-viewer/last-seen', requireAuth(), requireAnyAdminRole(), async (c) => {
    const db = getDb(c);
    const query = (c.req.query('q') ?? '').trim();

    let matchedUserIds: number[] | null = null;
    if (query) {
        const term = `%${query}%`;
        const [userRows, aliasRows] = await Promise.all([
            db.select({ userId: users.id }).from(users).where(or(like(users.email, term), like(users.displayName, term))).all(),
            db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(like(userLoginEmails.email, term)).all(),
        ]);
        matchedUserIds = [...new Set([...userRows, ...aliasRows].map((row) => row.userId))];
        if (!matchedUserIds.length) return c.json([]);
    }

    const sessionRows = await db.select({
        userId: sessions.userId,
        lastSeenAt: sql<number | null>`max(${sessions.lastSeenAt})`,
    }).from(sessions)
        .where(matchedUserIds ? inArray(sessions.userId, matchedUserIds) : undefined)
        .groupBy(sessions.userId)
        .having(sql`max(${sessions.lastSeenAt}) is not null`)
        .orderBy(desc(sql`max(${sessions.lastSeenAt})`))
        .limit(100).all();
    if (!sessionRows.length) return c.json([]);

    const userRows = await db.select({ id: users.id, email: users.email, displayName: users.displayName })
        .from(users).where(inArray(users.id, sessionRows.map((row) => row.userId))).all();
    const userById = new Map(userRows.map((row) => [row.id, row]));

    return c.json(sessionRows.map((row) => {
        const user = userById.get(row.userId);
        return { userId: row.userId, email: user?.email ?? null, displayName: user?.displayName ?? null, lastSeenAt: row.lastSeenAt };
    }));
});

export default adminLogs;
