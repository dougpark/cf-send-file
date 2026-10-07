import type { MiddlewareHandler } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { findUserBySession, sessionCookie, SESSION_COOKIE } from '../lib/auth';
import { isLocalHostname } from './security';

function getCookie(request: Request, name: string): string | null {
    const cookies = request.headers.get('Cookie')?.split(';') ?? [];
    const value = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
    return value ? decodeURIComponent(value.trim().slice(name.length + 1)) : null;
}

export type PermissionFlags = {
    isOwner?: boolean | null;
    isAdmin?: boolean | null;
    isEditor?: boolean | null;
    isMember?: boolean | null;
};

// The authenticated principal stashed on the request context by requireAuth().
export type AppUser = PermissionFlags & {
    id: number;
    email: string;
    displayName?: string | null;
};

export type AppBindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
    ASSETS: Fetcher;
    AI: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
    HELP_INDEX: VectorizeIndex;
    EMAIL: { send(message: Record<string, unknown>): Promise<unknown> };
    // Verified sender for Cloudflare Email Sending, e.g. "noreply@example.com" (wrangler vars, per env).
    MAIL_FROM: string;
    DEV_BYPASS_AUTH?: string;
    DEV_BYPASS_ROLE?: string;
};

export type AppEnv = { Bindings: AppBindings; Variables: { user: AppUser; previousLastSeenAt?: Date | null } };

export const isOwner = (user?: PermissionFlags | null) => Boolean(user?.isOwner);
export const isAdmin = (user?: PermissionFlags | null) => Boolean(user?.isAdmin || user?.isOwner);
export const isEditor = (user?: PermissionFlags | null) => Boolean(user?.isEditor) || isAdmin(user);
export const hasAnyAdminRole = (user?: PermissionFlags | null) => isAdmin(user) || Boolean(user?.isEditor);
// Staff are always members, so a role grant never needs a separate membership approval.
export const isMember = (user?: PermissionFlags | null) => Boolean(user?.isMember) || hasAnyAdminRole(user);

// Local-only role simulation so each permission level can be exercised without real logins.
export function devBypassUser(role: string | undefined): AppUser {
    const flags: PermissionFlags = {
        owner: { isOwner: true, isAdmin: true, isMember: true },
        admin: { isAdmin: true, isMember: true },
        editor: { isEditor: true, isMember: true },
        member: { isMember: true },
        guest: {},
    }[role ?? 'admin'] ?? { isAdmin: true, isMember: true };
    return { id: 1, email: 'dev@localhost', displayName: `Dev ${role ?? 'admin'}`, ...flags };
}

// The bypass is only honored for loopback requests so a stray DEV_BYPASS_AUTH var on a deployed Worker can never open it up.
export function devBypassActive(env: { DEV_BYPASS_AUTH?: string }, requestUrl: string): boolean {
    return env.DEV_BYPASS_AUTH === 'true' && isLocalHostname(new URL(requestUrl).hostname);
}

export const requireAuth = (): MiddlewareHandler<AppEnv> => async (c, next) => {
    if (devBypassActive(c.env, c.req.url)) {
        c.set('user', devBypassUser(c.env.DEV_BYPASS_ROLE));
        return next();
    }

    const rawSession = getCookie(c.req.raw, SESSION_COOKIE);
    if (!rawSession) return c.json({ error: 'Unauthorized' }, 401);

    const authResult = await findUserBySession(drizzle(c.env.DB), rawSession);
    if (!authResult) return c.json({ error: 'Unauthorized' }, 401);

    c.set('user', authResult.user);
    if (authResult.previousLastSeenAt) c.set('previousLastSeenAt', authResult.previousLastSeenAt);

    await next();

    if (authResult.renewedExpiresAt) {
        const secure = new URL(c.req.url).protocol === 'https:';
        c.header('Set-Cookie', sessionCookie(rawSession, authResult.renewedExpiresAt, secure), { append: true });
    }
};

function requireFlag(check: (user?: PermissionFlags | null) => boolean, error = 'Forbidden'): MiddlewareHandler<AppEnv> {
    return async (c, next) => {
        if (!check(c.get('user'))) return c.json({ error }, 403);
        return next();
    };
}

export const requireOwner = () => requireFlag(isOwner);
export const requireAdmin = () => requireFlag(isAdmin);
export const requireEditor = () => requireFlag(isEditor);
export const requireAnyAdminRole = () => requireFlag(hasAnyAdminRole);
// Anyone can obtain a session by proving control of an email, so "signed in" alone is not "approved".
export const requireMember = () => requireFlag(isMember, 'Membership is pending approval.');

export { getCookie };
