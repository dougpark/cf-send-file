import { Hono } from 'hono';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { sessions, userLoginEmails, users } from '../../db/schema';
import { approvalLinkLifetimeMinutes, createMagicLinkToken, normalizeEmail } from '../../lib/auth';
import { logEmailFailure, sendMagicLinkEmail } from '../../lib/email';
import { getDb, isValidEmail, logActivity, mailContext, parseId, type DB } from '../../lib/context';
import { replaceLoginEmails } from '../account';
import { isOwner, requireAdmin, requireAuth, type AppEnv } from '../../middleware/auth';

const adminUsers = new Hono<AppEnv>();
// Per-route guards (not use('*')): sibling sub-apps share the /api/admin prefix and have looser guards.
const adminOnly = [requireAuth(), requireAdmin()] as const;

export const PERMISSION_FIELDS = ['isOwner', 'isAdmin', 'isEditor'] as const;
type PermissionField = (typeof PERMISSION_FIELDS)[number];

const OWNER_ONLY = 'Only an Owner can manage an Owner account.';

const displayNameOf = (row: { displayName?: string | null; email: string }) => row.displayName || row.email;

// A non-Owner admin acting on an Owner's account could take it over (alias login email,
// steal a magic link) or lock the Owner out, so those actions are Owner-only.
async function ownerTargetBlocked(db: DB, actor: { isOwner?: boolean | null }, targetUserId: number): Promise<boolean> {
    if (isOwner(actor)) return false;
    const target = await db.select({ isOwner: users.isOwner }).from(users).where(eq(users.id, targetUserId)).get();
    return Boolean(target?.isOwner);
}

/** User IDs whose primary email, alias email, or display name matches the search term. */
async function searchUserIds(db: DB, query: string): Promise<number[]> {
    const term = `%${query}%`;
    const [userRows, aliasRows] = await Promise.all([
        db.select({ userId: users.id }).from(users).where(or(like(users.email, term), like(users.displayName, term))).all(),
        db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(like(userLoginEmails.email, term)).all(),
    ]);
    return [...new Set([...userRows, ...aliasRows].map((row) => row.userId))];
}

const permissionColumns = {
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    isMember: users.isMember,
    isOwner: users.isOwner,
    isAdmin: users.isAdmin,
    isEditor: users.isEditor,
};

const toPermissionRow = (row: { id: number; email: string; displayName: string | null; isMember: boolean | null; isOwner: boolean | null; isAdmin: boolean | null; isEditor: boolean | null }) => ({
    ...row,
    userId: row.id,
    displayName: displayNameOf(row),
});

adminUsers.get('/users', ...adminOnly, async (c) => {
    const db = getDb(c);
    const [userRows, alternateRows] = await Promise.all([
        db.select().from(users).all(),
        db.select().from(userLoginEmails).all(),
    ]);
    return c.json(userRows.map((user) => ({
        ...user,
        alternateEmails: alternateRows.filter((item) => item.userId === user.id).map((item) => item.email),
    })));
});

adminUsers.get('/users/search', ...adminOnly, async (c) => {
    const db = getDb(c);
    const query = (c.req.query('q') ?? '').trim();
    if (!query) return c.json([]);
    const ids = await searchUserIds(db, query);
    if (!ids.length) return c.json([]);
    const rows = await db.select(permissionColumns).from(users).where(inArray(users.id, ids)).orderBy(users.email).limit(20).all();
    return c.json(rows.map(toPermissionRow));
});

adminUsers.get('/users/with-access', ...adminOnly, async (c) => {
    const rows = await getDb(c).select(permissionColumns).from(users)
        .where(or(eq(users.isOwner, true), eq(users.isAdmin, true), eq(users.isEditor, true)))
        .orderBy(users.email).all();
    return c.json(rows.map(toPermissionRow));
});

// Creates (or finds) an account by email so an admin can grant access before the person's first sign-in.
adminUsers.post('/access-control/users', ...adminOnly, async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const body = await c.req.json<{ email?: string; displayName?: string }>().catch(() => ({} as { email?: string; displayName?: string }));
    const email = normalizeEmail(body.email ?? '');
    if (!isValidEmail(email)) return c.json({ error: 'A valid email is required to add this user.' }, 400);

    let user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
        // The email may be an alias in userLoginEmails rather than a users.email row.
        const alias = await db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(eq(userLoginEmails.email, email)).get();
        if (alias) user = await db.select().from(users).where(eq(users.id, alias.userId)).get();
    }
    if (user?.isOwner && !isOwner(actor)) return c.json({ error: OWNER_ONLY }, 403);
    if (!user) {
        user = await db.insert(users).values({ email, displayName: body.displayName?.trim() || null })
            .returning().then((rows) => rows[0]);
        await logActivity(db, { category: 'user_management', action: 'create_user', actorUserId: actor.id, targetUserId: user!.id, details: { email } });
    }
    return c.json({ user });
});

adminUsers.put('/users/:userId/login-emails', ...adminOnly, async (c) => {
    const db = getDb(c);
    const userId = parseId(c.req.param('userId'));
    const body = await c.req.json<{ alternateEmails?: string[] }>().catch(() => ({} as { alternateEmails?: string[] }));
    if (!userId || !Array.isArray(body.alternateEmails)) return c.json({ error: 'Invalid login email update.' }, 400);
    if (await ownerTargetBlocked(db, c.get('user'), userId)) return c.json({ error: OWNER_ONLY }, 403);

    const user = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);
    const result = await replaceLoginEmails(db, user, body.alternateEmails);
    if (!result.ok) return c.json({ error: result.error }, 409);
    return c.json({ alternateEmails: result.emails });
});

adminUsers.put('/users/:userId/permissions', ...adminOnly, async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const userId = parseId(c.req.param('userId'));
    const body = await c.req.json<{ field?: PermissionField; value?: boolean }>().catch(() => ({} as { field?: PermissionField; value?: boolean }));
    if (!userId || !body.field || !PERMISSION_FIELDS.includes(body.field) || typeof body.value !== 'boolean') {
        return c.json({ error: 'Invalid permission update.' }, 400);
    }
    if (body.field === 'isOwner' && !isOwner(actor)) return c.json({ error: 'Only an Owner can change the Owner permission.' }, 403);

    const target = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);
    if (target.isOwner && !isOwner(actor)) return c.json({ error: 'Only an Owner can change an Owner\u2019s permissions.' }, 403);

    if (body.field === 'isOwner' && !body.value) {
        if (target.id === actor.id) return c.json({ error: 'You cannot remove your own Owner permission.' }, 409);
        const ownerCount = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isOwner, true)).get();
        if (target.isOwner && (ownerCount?.count ?? 0) <= 1) return c.json({ error: 'At least one Owner is required.' }, 409);
    }

    const nextValues: Partial<Record<PermissionField, boolean>> & { updatedAt: Date } = { [body.field]: body.value, updatedAt: new Date() };
    if (body.field === 'isOwner' && body.value) nextValues.isAdmin = true; // Owner always implies Admin

    await db.update(users).set(nextValues).where(eq(users.id, userId));
    await logActivity(db, { category: 'access_control', action: 'set_permission', actorUserId: actor.id, targetUserId: userId, details: { field: body.field, from: target[body.field], to: body.value } });

    return c.json({ user: await db.select().from(users).where(eq(users.id, userId)).get() });
});

adminUsers.post('/users/:userId/permissions/clear', ...adminOnly, async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const userId = parseId(c.req.param('userId'));
    if (!userId) return c.json({ error: 'Invalid user ID.' }, 400);

    const target = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);
    if (target.isOwner && !isOwner(actor)) return c.json({ error: 'Only an Owner can remove Owner access.' }, 403);
    if (target.isOwner && target.id === actor.id) return c.json({ error: 'You cannot clear your own Owner access.' }, 409);
    if (target.isOwner) {
        const ownerCount = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isOwner, true)).get();
        if ((ownerCount?.count ?? 0) <= 1) return c.json({ error: 'At least one Owner is required.' }, 409);
    }

    const before = { isOwner: target.isOwner, isAdmin: target.isAdmin, isEditor: target.isEditor };
    await db.update(users).set({ isOwner: false, isAdmin: false, isEditor: false, updatedAt: new Date() }).where(eq(users.id, userId));
    await logActivity(db, { category: 'access_control', action: 'clear_permissions', actorUserId: actor.id, targetUserId: userId, details: { before } });
    return c.json({ cleared: true });
});

// Membership is the content gate; granting it here is the manual alternative to approving an access request.
adminUsers.put('/users/:userId/membership', ...adminOnly, async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const userId = parseId(c.req.param('userId'));
    const body = await c.req.json<{ isMember?: boolean }>().catch(() => ({} as { isMember?: boolean }));
    if (!userId || typeof body.isMember !== 'boolean') return c.json({ error: 'Invalid membership update.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: OWNER_ONLY }, 403);

    const target = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);

    await db.update(users).set({ isMember: body.isMember, updatedAt: new Date() }).where(eq(users.id, userId));
    await logActivity(db, { category: 'user_management', action: body.isMember ? 'grant_membership' : 'revoke_membership', actorUserId: actor.id, targetUserId: userId });
    return c.json({ isMember: body.isMember });
});

adminUsers.get('/login-users', ...adminOnly, async (c) => {
    const db = getDb(c);
    const query = (c.req.query('q') ?? '').trim();
    const matchedUserIds = query ? await searchUserIds(db, query) : null;
    if (matchedUserIds && !matchedUserIds.length) return c.json([]);

    const rows = await db.select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isMember: users.isMember,
        isOwner: users.isOwner,
        isAdmin: users.isAdmin,
        isEditor: users.isEditor,
        isSuspended: users.isSuspended,
        lastLoginAt: users.lastLoginAt,
    }).from(users)
        .where(matchedUserIds ? inArray(users.id, matchedUserIds) : undefined)
        .orderBy(desc(users.lastLoginAt))
        .limit(100).all();

    const userIds = rows.map((row) => row.id);
    const sessionRows = userIds.length
        ? await db.select({
            userId: sessions.userId,
            count: sql<number>`count(*)`,
            lastSeenAt: sql<number | null>`max(${sessions.lastSeenAt})`,
        }).from(sessions).where(inArray(sessions.userId, userIds)).groupBy(sessions.userId).all()
        : [];
    const sessionByUser = new Map(sessionRows.map((row) => [row.userId, row]));

    return c.json(rows.map((row) => ({
        ...row,
        displayName: displayNameOf(row),
        isMember: Boolean(row.isMember || row.isOwner || row.isAdmin || row.isEditor),
        isSuspended: Boolean(row.isSuspended),
        sessionCount: sessionByUser.get(row.id)?.count ?? 0,
        lastSeenAt: sessionByUser.get(row.id)?.lastSeenAt ?? null,
    })));
});

adminUsers.get('/users/:userId/sessions', ...adminOnly, async (c) => {
    const db = getDb(c);
    const userId = parseId(c.req.param('userId'));
    if (!userId) return c.json({ error: 'Invalid user ID.' }, 400);
    if (await ownerTargetBlocked(db, c.get('user'), userId)) return c.json({ error: OWNER_ONLY }, 403);
    const rows = await db.select({
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        lastSeenAt: sessions.lastSeenAt,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
    }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.lastSeenAt)).all();
    // Session IDs are hashed tokens, not safe to expose to the client; row order is the handle instead.
    return c.json(rows.map((row, index) => ({ ...row, id: index })));
});

adminUsers.delete('/users/:userId/sessions/:sessionIndex', ...adminOnly, async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const userId = parseId(c.req.param('userId'));
    const sessionIndex = Number(c.req.param('sessionIndex'));
    if (!userId || !Number.isInteger(sessionIndex) || sessionIndex < 0) return c.json({ error: 'Invalid session.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: OWNER_ONLY }, 403);

    const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.lastSeenAt)).all();
    const target = rows[sessionIndex];
    if (!target) return c.json({ error: 'Session not found.' }, 404);

    await db.delete(sessions).where(and(eq(sessions.id, target.id), eq(sessions.userId, userId)));
    await logActivity(db, { category: 'user_management', action: 'revoke_session', actorUserId: actor.id, targetUserId: userId });
    return c.json({ revoked: true });
});

adminUsers.put('/users/:userId/suspend', ...adminOnly, async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const userId = parseId(c.req.param('userId'));
    const body = await c.req.json<{ suspended?: boolean }>().catch(() => ({} as { suspended?: boolean }));
    if (!userId || typeof body.suspended !== 'boolean') return c.json({ error: 'Invalid suspension update.' }, 400);
    if (userId === actor.id && body.suspended) return c.json({ error: 'You cannot suspend your own account.' }, 409);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: OWNER_ONLY }, 403);

    const target = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);

    await db.update(users).set({ isSuspended: body.suspended, updatedAt: new Date() }).where(eq(users.id, userId));
    if (body.suspended) await db.delete(sessions).where(eq(sessions.userId, userId));
    await logActivity(db, { category: 'user_management', action: body.suspended ? 'suspend' : 'unsuspend', actorUserId: actor.id, targetUserId: userId });
    return c.json({ isSuspended: body.suspended });
});

adminUsers.post('/users/:userId/force-logout', ...adminOnly, async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const userId = parseId(c.req.param('userId'));
    if (!userId) return c.json({ error: 'Invalid user ID.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: OWNER_ONLY }, 403);

    const target = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);

    const removed = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
    await logActivity(db, { category: 'user_management', action: 'force_logout', actorUserId: actor.id, targetUserId: userId, details: { sessionsRemoved: removed.length } });
    return c.json({ sessionsRemoved: removed.length });
});

adminUsers.post('/users/:userId/send-magic-link', ...adminOnly, async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const userId = parseId(c.req.param('userId'));
    if (!userId) return c.json({ error: 'Invalid user ID.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: OWNER_ONLY }, 403);

    const target = await db.select({ id: users.id, email: users.email, isSuspended: users.isSuspended }).from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);
    if (target.isSuspended) return c.json({ error: 'Cannot send a sign-in link to a suspended account.' }, 409);

    const token = await createMagicLinkToken(db, target.email);
    try {
        await sendMagicLinkEmail(await mailContext(c, db), target.email, token.rawToken, token.rawCode);
    } catch (error) {
        logEmailFailure('Admin-triggered magic-link email failed', error, target.email);
        return c.json({ error: 'We could not send the email right now. Please try again later.' }, 503);
    }
    await logActivity(db, { category: 'user_management', action: 'magic_link_dispatch', actorUserId: actor.id, targetUserId: userId });
    return c.json({ sent: true });
});

adminUsers.post('/users/:userId/login-link', ...adminOnly, async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const userId = parseId(c.req.param('userId'));
    if (!userId) return c.json({ error: 'Invalid user ID.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: OWNER_ONLY }, 403);

    const target = await db.select({ id: users.id, email: users.email, isSuspended: users.isSuspended }).from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);
    if (target.isSuspended) return c.json({ error: 'Cannot create a sign-in link for a suspended account.' }, 409);

    // Longer lifetime than emailed links, since the admin delivers this one by hand.
    const token = await createMagicLinkToken(db, target.email, approvalLinkLifetimeMinutes);
    await logActivity(db, { category: 'user_management', action: 'magic_link_copy', actorUserId: actor.id, targetUserId: userId });

    const url = `${new URL(c.req.url).origin}/auth/verify?token=${encodeURIComponent(token.rawToken)}`;
    return c.json({ url, expiresInHours: approvalLinkLifetimeMinutes / 60 });
});

export default adminUsers;
