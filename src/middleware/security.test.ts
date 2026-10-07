import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { devBypassActive } from './auth';
import { sameOriginOnly, securityHeaders } from './security';

function buildApp() {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.use('/api/*', sameOriginOnly(['/api/webhooks/stripe']));
    app.get('/api/data', (c) => c.json({ ok: true }));
    app.post('/api/data', (c) => c.json({ ok: true }));
    app.post('/api/webhooks/stripe', (c) => c.json({ ok: true }));
    return app;
}

describe('securityHeaders', () => {
    test('API JSON is no-store and nosniff', async () => {
        const res = await buildApp().request('https://example.com/api/data');
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('X-Frame-Options')).toBe('DENY');
        expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
    });

    test('static-asset CSP (public/_headers) forbids inline scripts and framing', async () => {
        const headersFile = await Bun.file(new URL('../../public/_headers', import.meta.url)).text();
        const csp = headersFile.split('\n').find((line) => line.includes('Content-Security-Policy')) ?? '';
        expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
        expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("object-src 'none'");
    });
});

describe('sameOriginOnly', () => {
    const post = (headers: Record<string, string>, path = '/api/data') =>
        buildApp().request(`https://example.com${path}`, { method: 'POST', headers });

    test('rejects a cross-origin Origin', async () => {
        expect((await post({ Origin: 'https://staging.example.com' })).status).toBe(403);
        expect((await post({ Origin: 'https://evil.example' })).status).toBe(403);
    });

    test('rejects a cross-site Sec-Fetch-Site when Origin is absent', async () => {
        expect((await post({ 'Sec-Fetch-Site': 'same-site' })).status).toBe(403);
    });

    test('allows same-origin requests and the Stripe webhook', async () => {
        expect((await post({ Origin: 'https://example.com' })).status).toBe(200);
        expect((await post({}, '/api/webhooks/stripe')).status).toBe(200);
    });

    test('never blocks safe methods', async () => {
        const res = await buildApp().request('https://example.com/api/data', { headers: { Origin: 'https://evil.example' } });
        expect(res.status).toBe(200);
    });
});

describe('devBypassActive', () => {
    test('only honors DEV_BYPASS_AUTH on loopback hosts', () => {
        expect(devBypassActive({ DEV_BYPASS_AUTH: 'true' }, 'http://localhost:8787/api/x')).toBe(true);
        expect(devBypassActive({ DEV_BYPASS_AUTH: 'true' }, 'https://example.com/api/x')).toBe(false);
        expect(devBypassActive({ DEV_BYPASS_AUTH: 'false' }, 'http://localhost:8787/api/x')).toBe(false);
        expect(devBypassActive({}, 'http://localhost:8787/api/x')).toBe(false);
    });
});
