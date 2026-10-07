import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import app from '../index';
import type { AppBindings } from '../middleware/auth';

// No real D1 here: a role that passes its guard reaches the handler and fails on the missing DB (500),
// which is enough to prove the guard let it through. A blocked role never touches the DB (401/403).
const asRole = (role: string | null) =>
    (role ? { DEV_BYPASS_AUTH: 'true', DEV_BYPASS_ROLE: role } : { DEV_BYPASS_AUTH: 'false' }) as AppBindings;

async function statusFor(path: string, role: string | null, init?: RequestInit) {
    const response = await app.request(`http://localhost${path}`, init, asRole(role));
    return response.status;
}

let errorSpy: ReturnType<typeof spyOn>;
beforeAll(() => { errorSpy = spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => errorSpy.mockRestore());

const allowed = (status: number) => status !== 401 && status !== 403;

describe('admin route guards', () => {
    test('signed-out requests are rejected', async () => {
        expect(await statusFor('/api/admin/status', null)).toBe(401);
        expect(await statusFor('/api/auth/me', null)).toBe(401);
    });

    test('members and guests cannot reach any admin endpoint', async () => {
        for (const role of ['member', 'guest']) {
            for (const path of ['/api/admin/status', '/api/admin/log-viewer/logs', '/api/admin/login-users', '/api/admin/settings']) {
                expect(await statusFor(path, role), `${role} ${path}`).toBe(403);
            }
        }
    });

    test('editors reach staff pages but not admin-only pages', async () => {
        for (const path of ['/api/admin/status', '/api/admin/log-viewer/logs', '/api/admin/log-viewer/last-seen', '/api/admin/access-requests/count']) {
            expect(allowed(await statusFor(path, 'editor')), path).toBe(true);
        }
        for (const path of ['/api/admin/login-users', '/api/admin/users/with-access', '/api/admin/settings', '/api/admin/access-requests']) {
            expect(await statusFor(path, 'editor'), path).toBe(403);
        }
    });

    test('admins reach admin-only pages', async () => {
        for (const path of ['/api/admin/login-users', '/api/admin/users/with-access', '/api/admin/settings']) {
            expect(allowed(await statusFor(path, 'admin')), path).toBe(true);
        }
    });

    test('only an Owner may grant the Owner permission', async () => {
        const status = await statusFor('/api/admin/users/2/permissions', 'admin', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
            body: JSON.stringify({ field: 'isOwner', value: true }),
        });
        expect(status).toBe(403);
    });

    test('unknown API paths return JSON 404 instead of the SPA', async () => {
        const response = await app.request('http://localhost/api/nope', undefined, asRole('admin'));
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'Not found' });
    });
});
