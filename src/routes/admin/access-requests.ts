import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { accessRequests, userLoginEmails, users } from '../../db/schema';
import { approvalLinkLifetimeMinutes, createMagicLinkToken, normalizeEmail } from '../../lib/auth';
import { logEmailFailure, sendAccessRequestOutcomeEmail } from '../../lib/email';
import { getDb, logActivity, mailContext, parseId } from '../../lib/context';
import { isOwner, requireAdmin, requireAnyAdminRole, requireAuth, type AppEnv } from '../../middleware/auth';

const adminAccessRequests = new Hono<AppEnv>();

adminAccessRequests.get('/access-requests', requireAuth(), requireAdmin(), async (c) => {
    return c.json(await getDb(c).select().from(accessRequests).orderBy(desc(accessRequests.createdAt)).all());
});

adminAccessRequests.get('/access-requests/count', requireAuth(), requireAnyAdminRole(), async (c) => {
    const row = await getDb(c).select({ count: sql<number>`count(*)` }).from(accessRequests)
        .where(eq(accessRequests.status, 'pending')).get();
    return c.json({ count: row?.count ?? 0 });
});

adminAccessRequests.patch('/access-requests/:requestId', requireAuth(), requireAdmin(), async (c) => {
    const db = getDb(c);
    const admin = c.get('user');
    const requestId = parseId(c.req.param('requestId'));
    const body = await c.req.json<{ status?: 'approved' | 'rejected'; notes?: string }>().catch(() => ({} as { status?: 'approved' | 'rejected'; notes?: string }));
    const reviewStatus = body.status;
    if (!requestId || !reviewStatus || !['approved', 'rejected'].includes(reviewStatus)) {
        return c.json({ error: 'Invalid access request update.' }, 400);
    }

    const request = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId)).get();
    if (!request) return c.json({ error: 'Access request not found.' }, 404);
    if (request.status !== 'pending') return c.json({ error: 'This request has already been reviewed.' }, 409);

    const email = normalizeEmail(request.email);
    let outcomeToken: string | null = null;
    if (reviewStatus === 'approved') {
        let user = await db.select().from(users).where(eq(users.email, email)).get();
        if (!user) {
            const alias = await db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(eq(userLoginEmails.email, email)).get();
            if (alias) user = await db.select().from(users).where(eq(users.id, alias.userId)).get();
        }
        if (!user) return c.json({ error: 'The requester account was not found.' }, 404);
        if (user.isOwner && !isOwner(admin)) return c.json({ error: 'Only an Owner can manage an Owner account.' }, 403);

        await db.update(users).set({
            isMember: true,
            displayName: user.displayName || request.fullName,
            updatedAt: new Date(),
        }).where(eq(users.id, user.id));
        outcomeToken = (await createMagicLinkToken(db, email, approvalLinkLifetimeMinutes)).rawToken;
    }

    await db.update(accessRequests).set({
        status: reviewStatus,
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
        notes: body.notes?.trim() || null,
    }).where(eq(accessRequests.id, requestId));
    await logActivity(db, { category: 'access_request', action: reviewStatus, actorUserId: admin.id, details: { requestId, email } });

    try {
        await sendAccessRequestOutcomeEmail(await mailContext(c, db), email, reviewStatus, outcomeToken);
    } catch (error) {
        logEmailFailure('Access request outcome email failed', error, email);
        return c.json({ success: true, emailSent: false, warning: 'The request was updated, but the outcome email could not be sent.' });
    }
    return c.json({ success: true, emailSent: true });
});

export default adminAccessRequests;
