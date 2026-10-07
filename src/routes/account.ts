import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { userLoginEmails, users } from '../db/schema';
import { getDb, isValidEmail, type DB } from '../lib/context';
import { normalizeEmail } from '../lib/auth';
import { requireAuth, type AppEnv } from '../middleware/auth';

const account = new Hono<AppEnv>();
account.use('/account/*', requireAuth());

/** Replaces a user's alternate sign-in emails, rejecting any address owned by another account. */
export async function replaceLoginEmails(db: DB, user: { id: number; email: string }, rawEmails: string[]) {
    const emails = [...new Set(rawEmails.map(normalizeEmail).filter(isValidEmail))]
        .filter((email) => email !== normalizeEmail(user.email));
    for (const email of emails) {
        const primaryOwner = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
        const alternateOwner = await db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(eq(userLoginEmails.email, email)).get();
        if ((primaryOwner && primaryOwner.id !== user.id) || (alternateOwner && alternateOwner.userId !== user.id)) {
            return { ok: false as const, error: `Login Email ${email} is already assigned to another user.` };
        }
    }

    const keep = new Set(emails);
    const existing = await db.select().from(userLoginEmails).where(eq(userLoginEmails.userId, user.id)).all();
    for (const item of existing) {
        if (!keep.has(item.email)) await db.delete(userLoginEmails).where(eq(userLoginEmails.id, item.id));
    }
    for (const email of emails) {
        await db.insert(userLoginEmails).values({ userId: user.id, email }).onConflictDoNothing();
    }
    return { ok: true as const, emails };
}

account.get('/account/login-emails', async (c) => {
    const rows = await getDb(c).select({ email: userLoginEmails.email })
        .from(userLoginEmails).where(eq(userLoginEmails.userId, c.get('user').id)).all();
    return c.json({ emails: rows.map((item) => item.email) });
});

account.put('/account/login-emails', async (c) => {
    const db = getDb(c);
    const user = await db.select().from(users).where(eq(users.id, c.get('user').id)).get();
    if (!user) return c.json({ error: 'User account not found.' }, 404);
    const body = await c.req.json<{ emails?: string[] }>().catch(() => ({} as { emails?: string[] }));
    if (!Array.isArray(body.emails)) return c.json({ error: 'Invalid Login Email update.' }, 400);

    const result = await replaceLoginEmails(db, user, body.emails);
    if (!result.ok) return c.json({ error: result.error }, 409);
    return c.json({ emails: result.emails });
});

account.put('/account/profile', async (c) => {
    const body = await c.req.json<{ displayName?: string }>().catch(() => ({} as { displayName?: string }));
    const displayName = body.displayName?.trim().slice(0, 100) || null;
    await getDb(c).update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, c.get('user').id));
    return c.json({ displayName });
});

export default account;
