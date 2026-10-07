import { Hono } from 'hono';
import { eq, or, sql } from 'drizzle-orm';
import { accessRequests, sessions, userLoginEmails, users } from '../../db/schema';
import { getDb } from '../../lib/context';
import { requireAnyAdminRole, requireAuth, type AppEnv } from '../../middleware/auth';

const adminStatus = new Hono<AppEnv>();

adminStatus.get('/status', requireAuth(), requireAnyAdminRole(), async (c) => {
    const db = getDb(c);
    const nowSec = Math.floor(Date.now() / 1000);
    const dayAgoSec = nowSec - 24 * 60 * 60;
    const weekAgoSec = nowSec - 7 * 24 * 60 * 60;
    const monthAgoSec = nowSec - 30 * 24 * 60 * 60;
    const quarterAgoSec = nowSec - 90 * 24 * 60 * 60;
    const count = sql<number>`count(*)`;
    const [userCount, memberCount, staffCount, suspendedCount, aliasLoginCount, openAccessRequestCount, active] = await Promise.all([
        db.select({ count }).from(users).get(),
        db.select({ count }).from(users).where(or(eq(users.isMember, true), eq(users.isOwner, true), eq(users.isAdmin, true), eq(users.isEditor, true))).get(),
        db.select({ count }).from(users).where(or(eq(users.isOwner, true), eq(users.isAdmin, true), eq(users.isEditor, true))).get(),
        db.select({ count }).from(users).where(eq(users.isSuspended, true)).get(),
        db.select({ count }).from(userLoginEmails).get(),
        db.select({ count }).from(accessRequests).where(eq(accessRequests.status, 'pending')).get(),
        db.select({
            dau: sql<number>`count(distinct case when ${sessions.lastSeenAt} >= ${dayAgoSec} then ${sessions.userId} end)`,
            wau: sql<number>`count(distinct case when ${sessions.lastSeenAt} >= ${weekAgoSec} then ${sessions.userId} end)`,
            mau: sql<number>`count(distinct case when ${sessions.lastSeenAt} >= ${monthAgoSec} then ${sessions.userId} end)`,
            qau: sql<number>`count(distinct case when ${sessions.lastSeenAt} >= ${quarterAgoSec} then ${sessions.userId} end)`,
        }).from(sessions).where(sql`${sessions.lastSeenAt} >= ${quarterAgoSec}`).get(),
    ]);

    return c.json({
        loginAccounts: userCount?.count ?? 0,
        members: memberCount?.count ?? 0,
        staff: staffCount?.count ?? 0,
        suspended: suspendedCount?.count ?? 0,
        aliasLogins: aliasLoginCount?.count ?? 0,
        openAccessRequests: openAccessRequestCount?.count ?? 0,
        dau: active?.dau ?? 0,
        wau: active?.wau ?? 0,
        mau: active?.mau ?? 0,
        qau: active?.qau ?? 0,
    });
});

export default adminStatus;
