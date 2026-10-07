import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './auth';

export function isLocalHostname(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

// Baseline headers for Worker-handled responses (/api/*). Static assets never reach the Worker, so their
// headers (including the Content-Security-Policy) live in public/_headers and must be kept in sync.
export const securityHeaders = (): MiddlewareHandler<AppEnv> => async (c, next) => {
    await next();

    // Responses proxied from the ASSETS binding have immutable headers; copy before editing.
    const response = new Response(c.res.body, c.res);
    const headers = response.headers;
    const url = new URL(c.req.url);

    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    if (url.protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');

    // Authenticated JSON must never linger in browser/proxy caches after logout.
    if (url.pathname.startsWith('/api/') && !headers.has('Cache-Control')) {
        headers.set('Cache-Control', 'no-store');
    }

    c.res = response;
};

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// CSRF defense in depth on top of SameSite=Lax: sibling subdomains (staging.*) are same-site, so
// browser-supplied Origin / Sec-Fetch-Site must show the request came from this exact origin.
// Server-to-server webhooks (no browser headers) must be listed in exemptPaths and authenticate by signature.
export const sameOriginOnly = (exemptPaths: string[] = []): MiddlewareHandler<AppEnv> => async (c, next) => {
    if (!UNSAFE_METHODS.has(c.req.method) || exemptPaths.includes(c.req.path)) return next();

    const origin = c.req.header('Origin');
    const fetchSite = c.req.header('Sec-Fetch-Site');
    const requestHost = new URL(c.req.url).host;

    let allowed = true;
    if (origin) {
        try {
            allowed = new URL(origin).host === requestHost;
        } catch {
            allowed = false;
        }
    } else if (fetchSite) {
        allowed = fetchSite === 'same-origin' || fetchSite === 'none';
    }

    if (!allowed) return c.json({ error: 'Cross-origin request blocked.' }, 403);
    return next();
};
