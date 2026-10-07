import { describe, expect, test } from 'bun:test';
import { createTestDb } from '../test/db';
import { completeLogin, createMagicLinkToken, verifyCodeAndConsume } from './auth';
import { magicTokens, users } from '../db/schema';

const setupDb = createTestDb;

describe('verifyCodeAndConsume', () => {
    test('locks the code after 5 wrong guesses even when the right code is then submitted', async () => {
        const { db } = setupDb();
        const { rawCode } = await createMagicLinkToken(db, 'a@example.com');
        const wrong = rawCode === '000000' ? '111111' : '000000';

        for (let i = 0; i < 5; i++) {
            const result = await verifyCodeAndConsume(db, 'a@example.com', wrong);
            expect(result.ok).toBe(false);
        }
        const locked = await verifyCodeAndConsume(db, 'a@example.com', rawCode);
        expect(locked.ok).toBe(false);
        expect(await db.select().from(magicTokens).all()).toHaveLength(0);
    });

    test('a correct code works once and is then consumed', async () => {
        const { db } = setupDb();
        const { rawCode } = await createMagicLinkToken(db, 'a@example.com');
        expect((await verifyCodeAndConsume(db, 'a@example.com', rawCode)).ok).toBe(true);
        expect((await verifyCodeAndConsume(db, 'a@example.com', rawCode)).ok).toBe(false);
    });
});

describe('completeLogin', () => {
    test('a first sign-in creates a non-member account when open sign-up is off', async () => {
        const { db } = setupDb();
        const result = await completeLogin(db, 'New@Example.com');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.user.email).toBe('new@example.com');
        expect(result.user.isMember).toBe(false);
        expect(result.user.isAdmin).toBeFalsy();
    });

    test('open sign-up makes a brand-new account a member immediately', async () => {
        const { db } = setupDb();
        const result = await completeLogin(db, 'open@example.com', undefined, { openSignup: true });
        expect(result.ok && result.user.isMember).toBe(true);
    });

    test('open sign-up does not change an existing account that was revoked', async () => {
        const { sqlite, db } = setupDb();
        sqlite.exec(`INSERT INTO users (id, email, is_member) VALUES (1, 'revoked@example.com', 0);`);
        const result = await completeLogin(db, 'revoked@example.com', undefined, { openSignup: true });
        expect(result.ok && result.user.isMember).toBe(false);
    });

    test('an alias login email signs in as the account that owns it', async () => {
        const { sqlite, db } = setupDb();
        sqlite.exec(`
            INSERT INTO users (id, email, is_member) VALUES (1, 'primary@example.com', 1);
            INSERT INTO user_login_emails (user_id, email) VALUES (1, 'alias@example.com');
        `);
        const result = await completeLogin(db, 'alias@example.com');
        expect(result.ok && result.user.id).toBe(1);
        expect(await db.select().from(users).all()).toHaveLength(1);
    });

    test('a suspended account is refused and gets no session', async () => {
        const { sqlite, db } = setupDb();
        sqlite.exec(`INSERT INTO users (id, email, is_suspended) VALUES (1, 'suspended@example.com', 1);`);
        const result = await completeLogin(db, 'suspended@example.com');
        expect(result.ok).toBe(false);
        expect(sqlite.query('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    });
});
