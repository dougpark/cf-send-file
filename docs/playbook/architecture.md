# Architecture

One repo, one Cloudflare Worker, one Vue SPA. The Worker serves `/api/*`; everything else is static assets from `dist/` with SPA fallback.

## Repo layout

```
index.html                 # Vite entry; loads /theme-init.js before paint
public/                    # copied verbatim to dist/ (favicons, _headers, theme-init.js, logo)
src/
  index.ts                 # Hono Worker (exported default app)
  main.ts, App.vue         # Vue entry + app shell
  router/index.ts          # routes + global auth guard
  db/schema.ts             # Drizzle schema — single source of truth for D1
  middleware/auth.ts       # AppBindings/AppEnv types, requireAuth/requireAdmin/... guards
  middleware/security.ts   # security headers + same-origin check for unsafe methods
  lib/                     # server + shared logic (auth, email, settings, markdown, rag…) + *.test.ts
  composables/             # small focused Vue composables (useTheme, useSiteSettings…)
  components/<feature>/    # ui/, layout/, common/, menus/, pages/, … by feature
  views/                   # route-level views (AdminXxxView.vue for admin panels)
  content/docs/            # markdown help docs (indexed for the AI help chat)
  style.css                # Tailwind v4 import + theme tokens
migrations/                # SQL migrations (committed)
scripts/                   # bun scripts: seed, export, count, index-help-docs
docs/                      # feature plans + this playbook
justfile                   # human-friendly ops commands
wrangler.json              # bindings for dev / staging / production
```

TypeScript is split: `tsconfig.worker.json` (Workers types, only server files) and `tsconfig.app.json` (DOM/Vue). Keep browser-only code (e.g. `photo-resize.ts`, canvas) out of the worker include list.

## Request flow

```
Browser ─► Cloudflare ─► Worker (run_worker_first: ["/api/*"])
                           ├─ /api/*  → Hono routes (D1, R2, AI, EMAIL bindings)
                           └─ else    → ASSETS (dist/) with not_found_handling: single-page-application
```

`wrangler.json` assets block:

```json
"assets": {
  "directory": "./dist",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]
}
```

Do **not** write custom file-streaming routes for normal static files. Only private R2 objects go through Worker routes.

## Worker (Hono)

```ts
const app = new Hono<AppEnv>();
app.use('*', securityHeaders());
app.use('/api/*', sameOriginOnly(['/api/webhooks/stripe'])); // exempt server-to-server webhooks
// ...routes...
// Unknown API paths must not fall through to the SPA shell (HTML with a 200).
app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
export default app;
```

- **Bindings type** lives in `src/middleware/auth.ts` as `AppBindings` (`DB`, `BUCKET`, `ASSETS`, `AI`, `HELP_INDEX`, `EMAIL`, secrets/vars) and `AppEnv = { Bindings: AppBindings; Variables: { user; previousLastSeenAt } }`.
- **Drizzle per request**: `const db = drizzle(c.env.DB)` inside handlers — never a module-level DB.
- **Route namespaces**: `/api/health`, `/api/settings` (public), `/api/auth/*`, `/api/account/*`, `/api/admin/*` (role-guarded), feature routes, `/api/files/*` (R2), `/api/webhooks/*`.
- **Guards are middleware per route**: `app.get('/api/admin/x', requireAdmin(), handler)`. The authenticated user is `c.get('user')`.
- **Errors** are always JSON `{ error: string }` with a meaningful status: 400 bad input, 401 no session, 403 role, 404, 409 conflict/duplicate, 413 too large, 415 bad type, 429 rate limited, 503 provider failure. Never log secrets or raw tokens.
- **Dev auth bypass**: `DEV_BYPASS_AUTH=true` + `DEV_BYPASS_ROLE` only honored for loopback hostnames.
- parkhillfw keeps all routes in one ~3800-line `src/index.ts`. **For a new project, split into route modules** (`src/routes/auth.ts`, `src/routes/admin/*.ts`) mounted with `app.route('/api/admin', adminRoutes)` — the single file became hard to navigate.

## Frontend (Vue)

- `<script setup lang="ts">` only. `ref()` for primitives/arrays, `reactive()` sparingly.
- All views lazy-loaded: `component: () => import('../views/EventsView.vue')`.
- Route names are kebab-case (`admin-users`, `library-document`).
- Route `meta`: `guestOnly`, `requiresAuth`, `requiresDirectory` (app-specific "approved member"), `requiresAdmin`, `requiresAnyAdminRole`. `beforeEach` calls `/api/auth/me` and redirects. **Guards are UX only — the server re-checks everything.**
- `src/main.ts` re-checks `/api/auth/me` on `pageshow` with `event.persisted` (bfcache restore) so a logged-out user never sees cached private pages.
- Vite dev server proxies `/api` → `http://localhost:8787` (wrangler dev). Alias `@` → `src`.

### Fetch convention (no wrapper library)

```ts
loading.value = true; error.value = '';
try {
  const res = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Unable to save settings.');
  // ...
} catch (caught) {
  error.value = caught instanceof Error ? caught.message : 'Unable to complete request.';
} finally {
  loading.value = false;
}
```

- Debounce search 250 ms; require ≥ 2 chars; use a request counter/token so stale responses don't overwrite newer ones.
- A tiny `api.ts` helper wrapping the above is a reasonable improvement for a new project.

### Composables pattern

Module-level shared state + one cached promise (e.g. `useSiteSettings` fetches `/api/settings` once for the whole app, falls back to a default on failure).

## Testing

- `bun test`, files colocated as `src/lib/*.test.ts`, `src/middleware/*.test.ts`.
- Prefer **pure functions** in `src/lib` (date math, chunking, parsing, report math) — easy to test.
- Route tests import the real Hono app and call `app.request(url, init, fakeBindings)` with structural fakes (e.g. `{ DEV_BYPASS_AUTH: 'false' } as AppBindings`). Assert that providers (AI, email, Stripe) are **not** called when validation/auth fails.
- Security behaviors deserve explicit tests: code-attempt lockout, single-use tokens, elevated-account protection, same-origin rejection.

## Commands

```bash
bun install
bun run dev          # wrangler dev (:8787) + vite (:5173) together
bun run build        # vite build → dist/
bun test
bun run db:generate  # drizzle-kit generate → migrations/
just                 # list ops recipes (migrate-*, deploy-*, logs-*, sync-*)
```
