import { Hono } from 'hono';
import auth from './routes/auth';
import account from './routes/account';
import settingsRoutes from './routes/settings';
import help from './routes/help';
import adminUsers from './routes/admin/users';
import adminAccessRequests from './routes/admin/access-requests';
import adminLogs from './routes/admin/logs';
import adminStatus from './routes/admin/status';
import { sameOriginOnly, securityHeaders } from './middleware/security';
import type { AppEnv } from './middleware/auth';

const app = new Hono<AppEnv>();

app.use('*', securityHeaders());
// Add server-to-server webhook paths here (they authenticate by signature, not cookies).
app.use('/api/*', sameOriginOnly([]));

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.route('/api', auth);
app.route('/api', account);
app.route('/api', settingsRoutes);
app.route('/api', help);
app.route('/api/admin', adminUsers);
app.route('/api/admin', adminAccessRequests);
app.route('/api/admin', adminLogs);
app.route('/api/admin', adminStatus);

// Feature modules: create src/routes/<feature>.ts and mount it here.

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

app.onError((error, c) => {
    console.error('[unhandled]', c.req.method, new URL(c.req.url).pathname, error);
    return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

// Everything else is the Vue SPA (wrangler "assets" with not_found_handling: single-page-application).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
