import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { accessRequests, magicLinkRateLimits, magicTokens, sessions, userLoginEmails, users } from '../db/schema';
import { completeLogin, createMagicLinkToken, expiredSessionCookie, hashToken, normalizeEmail, sessionCookie, SESSION_COOKIE, verifyCodeAndConsume } from '../lib/auth';
import { logEmailFailure, sendAccessRequestAdminNotificationEmail, sendMagicLinkEmail } from '../lib/email';
import { getDb, getSiteSettings, isValidEmail, mailContext, type AppContext, type DB } from '../lib/context';
import { getCookie, isMember, requireAuth, type AppEnv } from '../middleware/auth';

const auth = new Hono<AppEnv>();

const SENT_MESSAGE = 'A sign-in link and code are on their way.';

function deviceFrom(c: AppContext) {
    return { userAgent: c.req.header('User-Agent'), ipAddress: c.req.header('CF-Connecting-IP') };
}

async function loginResponse(c: AppContext, db: DB, email: string) {
    const { openSignup } = await getSiteSettings(db);
    const loginResult = await completeLogin(db, email, deviceFrom(c), { openSignup });
    if (!loginResult.ok) return c.json({ error: loginResult.error }, loginResult.status);

    const secure = new URL(c.req.url).protocol === 'https:';
    const response = c.json({ matched: isMember(loginResult.user), userId: loginResult.user.id });
    response.headers.set('Set-Cookie', sessionCookie(loginResult.rawSession, loginResult.expiresAt, secure));
    return response;
}

auth.post('/auth/request-link', async (c) => {
    const db = getDb(c);
    const body = await c.req.json<{ email?: string }>().catch(() => ({} as { email?: string }));
    const email = normalizeEmail(body.email ?? '');
    if (!isValidEmail(email)) return c.json({ error: 'Enter a valid email address.' }, 400);

    const now = new Date();
    const existingLimit = await db.select().from(magicLinkRateLimits).where(eq(magicLinkRateLimits.email, email)).get();
    const minuteElapsed = existingLimit ? now.getTime() - existingLimit.minuteStartedAt.getTime() : Number.POSITIVE_INFINITY;
    const sameDay = existingLimit && now.getTime() - existingLimit.dailyStartedAt.getTime() < 24 * 60 * 60_000;

    if (minuteElapsed < 60_000) return c.json({ error: 'Please wait one minute before requesting another link.' }, 429);
    if (sameDay && existingLimit.dailyCount >= 10) return c.json({ error: 'Daily sign-in link limit reached. Please try again tomorrow.' }, 429);

    // Don't reveal account existence/status via a different response — suspended accounts silently get no email.
    const existingUser = await db.select({ id: users.id, isSuspended: users.isSuspended }).from(users).where(eq(users.email, email)).get();
    const existingAlias = existingUser ? null : await db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(eq(userLoginEmails.email, email)).get();
    const aliasUser = existingAlias ? await db.select({ isSuspended: users.isSuspended }).from(users).where(eq(users.id, existingAlias.userId)).get() : null;
    if (existingUser?.isSuspended || aliasUser?.isSuspended) return c.json({ message: SENT_MESSAGE });

    const dailyCount = sameDay ? existingLimit.dailyCount + 1 : 1;
    const dailyStartedAt = sameDay ? existingLimit.dailyStartedAt : now;
    await db.insert(magicLinkRateLimits).values({ email, minuteStartedAt: now, dailyStartedAt, dailyCount })
        .onConflictDoUpdate({ target: magicLinkRateLimits.email, set: { minuteStartedAt: now, dailyStartedAt, dailyCount } });

    const token = await createMagicLinkToken(db, email);
    try {
        await sendMagicLinkEmail(await mailContext(c, db), email, token.rawToken, token.rawCode);
    } catch (error) {
        logEmailFailure('Magic-link email failed', error, email);
        return c.json({ error: 'We could not send the email right now. Please try again later.' }, 503);
    }

    return c.json({ message: SENT_MESSAGE });
});

auth.post('/auth/verify-code', async (c) => {
    const db = getDb(c);
    const body = await c.req.json<{ email?: string; code?: string }>().catch(() => ({} as { email?: string; code?: string }));
    const email = normalizeEmail(body.email ?? '');
    const code = (body.code ?? '').trim();
    if (!isValidEmail(email)) return c.json({ error: 'Enter a valid email address.' }, 400);
    if (!/^\d{6}$/.test(code)) return c.json({ error: 'Enter the 6-digit code from your email.' }, 400);

    const codeResult = await verifyCodeAndConsume(db, email, code);
    if (!codeResult.ok) return c.json({ error: codeResult.error }, 400);
    return loginResponse(c, db, email);
});

// POST-only so email link scanners that prefetch the URL can't consume the token.
auth.post('/auth/verify', async (c) => {
    const db = getDb(c);
    const body = await c.req.json<{ token?: string }>().catch(() => ({ token: undefined }));
    const rawToken = body.token;
    if (!rawToken) return c.json({ error: 'Missing sign-in token.' }, 400);

    const token = await db.select().from(magicTokens).where(eq(magicTokens.token, await hashToken(rawToken))).get();
    if (!token || token.expiresAt.getTime() <= Date.now()) return c.json({ error: 'This sign-in link is invalid or expired.' }, 400);
    // Single-use: only the request whose delete removes the row may proceed.
    const consumed = await db.delete(magicTokens).where(eq(magicTokens.id, token.id)).returning({ id: magicTokens.id });
    if (!consumed.length) return c.json({ error: 'This sign-in link is invalid or expired.' }, 400);

    return loginResponse(c, db, token.email);
});

auth.get('/auth/me', requireAuth(), async (c) => {
    const user = c.get('user');
    const previousLastSeenAt = c.get('previousLastSeenAt');
    const pendingRequest = isMember(user) ? null : await getDb(c).select({ id: accessRequests.id }).from(accessRequests)
        .where(and(eq(accessRequests.email, user.email), eq(accessRequests.status, 'pending'))).get();
    return c.json({
        user: {
            ...user,
            displayName: user.displayName || user.email,
            lastActiveAt: previousLastSeenAt ? new Date(previousLastSeenAt).toISOString() : null,
        },
        matched: isMember(user),
        accessRequestPending: Boolean(pendingRequest),
    });
});

auth.post('/auth/logout', async (c) => {
    const rawSession = getCookie(c.req.raw, SESSION_COOKIE);
    if (rawSession) await getDb(c).delete(sessions).where(eq(sessions.id, await hashToken(rawSession)));
    const response = c.json({ success: true });
    response.headers.set('Set-Cookie', expiredSessionCookie(new URL(c.req.url).protocol === 'https:'));
    // Tells the browser to drop cached responses and local/session storage, IndexedDB, and service workers.
    response.headers.set('Clear-Site-Data', '"cache", "storage"');
    return response;
});

auth.post('/access-requests', requireAuth(), async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const body = await c.req.json<{ fullName?: string; message?: string }>().catch(() => ({} as { fullName?: string; message?: string }));
    const fullName = body.fullName?.trim() ?? '';
    const message = body.message?.trim().slice(0, 1000) || null;
    if (!fullName) return c.json({ error: 'Your name is required.' }, 400);
    if (isMember(user)) return c.json({ status: 'approved' });

    const pending = await db.select({ id: accessRequests.id }).from(accessRequests)
        .where(and(eq(accessRequests.email, user.email), eq(accessRequests.status, 'pending'))).get();
    if (!pending) {
        await db.insert(accessRequests).values({ email: user.email, fullName, message });
        try {
            await sendAccessRequestAdminNotificationEmail(await mailContext(c, db), user.email, fullName, message);
        } catch (error) {
            logEmailFailure('Access request admin notification email failed', error);
        }
    }
    return c.json({ status: 'pending' });
});

export default auth;
