import { Hono } from 'hono';
import { getDb, getSiteSettings, isValidEmail, logActivity } from '../lib/context';
import { SETTING_KEYS } from '../lib/config';
import { setSetting } from '../lib/settings';
import { requireAdmin, requireAuth, type AppEnv } from '../middleware/auth';

const settingsRoutes = new Hono<AppEnv>();

// Public, unauthenticated: the site name is used in the navbar and login screen before sign-in.
settingsRoutes.get('/settings', async (c) => {
    const { siteName } = await getSiteSettings(getDb(c));
    return c.json({ siteName });
});

settingsRoutes.get('/admin/settings', requireAuth(), requireAdmin(), async (c) => {
    return c.json(await getSiteSettings(getDb(c)));
});

settingsRoutes.put('/admin/settings', requireAuth(), requireAdmin(), async (c) => {
    const db = getDb(c);
    const actor = c.get('user');
    const body = await c.req.json<{ adminEmail?: string; siteName?: string; openSignup?: boolean }>()
        .catch(() => ({} as { adminEmail?: string; siteName?: string; openSignup?: boolean }));
    const changed: Record<string, unknown> = {};

    if (body.adminEmail !== undefined) {
        const adminEmail = body.adminEmail.trim();
        if (!isValidEmail(adminEmail)) return c.json({ error: 'Enter a valid admin email address.' }, 400);
        changed.adminEmail = adminEmail;
    }
    if (body.siteName !== undefined) {
        const siteName = body.siteName.trim();
        if (!siteName) return c.json({ error: 'Enter a site name.' }, 400);
        changed.siteName = siteName;
    }
    if (body.openSignup !== undefined) {
        if (typeof body.openSignup !== 'boolean') return c.json({ error: 'Open sign-up must be on or off.' }, 400);
        changed.openSignup = body.openSignup;
    }

    // Validate everything first so a bad field never leaves a half-applied update.
    if (changed.adminEmail !== undefined) await setSetting(db, SETTING_KEYS.adminEmail, changed.adminEmail, actor.id);
    if (changed.siteName !== undefined) await setSetting(db, SETTING_KEYS.siteName, changed.siteName, actor.id);
    if (changed.openSignup !== undefined) await setSetting(db, SETTING_KEYS.openSignup, changed.openSignup, actor.id);
    if (Object.keys(changed).length) {
        await logActivity(db, { category: 'settings', action: 'settings_updated', actorUserId: actor.id, details: changed });
    }

    return c.json(await getSiteSettings(db));
});

export default settingsRoutes;
