# Platform Services: D1, Settings, Email, R2, AI, Markdown, Logs

## D1 + Drizzle conventions

Schema: `src/db/schema.ts` (single source of truth). Config:

```ts
// drizzle.config.ts
export default defineConfig({ schema: './src/db/schema.ts', out: './migrations', dialect: 'sqlite' });
```

Column conventions:

```ts
id: integer('id').primaryKey({ autoIncrement: true }),
isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
// snake_case in SQL, camelCase in TS; named indexes:
(t) => [uniqueIndex('idx_users_email_unique').on(t.email), index('idx_pages_slug').on(t.slug)]
```

- Integer autoincrement ids; booleans/timestamps as integers with Drizzle modes.
- Every FK states its `onDelete` (`cascade` or `set null`) explicitly.
- Unique indexes on natural keys (email, settings key, external IDs like Stripe invoice id) — they double as **idempotency guards**.
- Self-referencing trees (`menus.parent_id`) complicate dump/restore — see `sync-*` recipes in the justfile (insert with NULL parent, then UPDATE).

Migration workflow → [deploy-and-environments.md](./deploy-and-environments.md#migrations).

Scripts that need bindings outside the Worker use wrangler's `getPlatformProxy()` (`scripts/run-seed-local.ts`); pass `remoteBindings: false` for local runs, otherwise the remote EMAIL binding can pull the proxy toward remote resources.

## Settings store (no-migration config)

```ts
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
}, (t) => [uniqueIndex('idx_settings_key_unique').on(t.key)]);
```

`src/lib/settings.ts`: `getSetting<T>(db, key, fallback)`, `getSettings(db)`, `setSetting(db, key, value, userId?)` (upsert on key).

- `GET /api/settings` → **public** subset only (e.g. `site_name`).
- `GET/PUT /api/admin/settings` → admin; server **whitelists editable keys** and validates values.
- Frontend `useSiteSettings()` → shared `siteName` ref, one cached fetch, default on failure. Used by App shell, login, verify, emails.
- Add new settings = new key + whitelist entry + admin field. No migration.

## Email (Cloudflare Email Sending)

`wrangler.json` (each env):

```json
"send_email": [{ "name": "EMAIL", "remote": true }]
```

`src/lib/email.ts`:

```ts
await env.EMAIL.send({
  to, from: `"${siteName}" <support@yourdomain>`, replyTo: `"Admin" <support@yourdomain>`,
  subject, html, text,
});
```

- Always send **both `html` and `text`**.
- HTML is **inline-styled** (email clients ignore stylesheets): outer white bg, 520px card `background:#f7f6f1; border:1px solid #d7ded8; border-radius:16px; padding:32px; color:#1e2f23`, centered logo (absolute URL from request origin), pill button `background:#e07a5f; color:#fff; padding:12px 24px; border-radius:999px`, muted footer `color:#52685a; font-size:13px`.
- `escapeHtml()` every user-supplied value and the site name.
- Emails in parkhillfw: magic link + code, new access request → admin, approved/rejected → requester (approval includes a 48 h one-time sign-in link).
- `"remote": true` means even `wrangler dev` sends real mail. There is no console-only fake — add a `EMAIL_MODE=log` dev switch in a new project if you want one.
- Sender/reply addresses are **hard-coded** in parkhillfw and drifted from `docs/email.md`; in a new project put `EMAIL_FROM` / `EMAIL_REPLY_TO` in wrangler `vars` per environment.

## R2 (private files)

Bucket is private. All reads go through `GET /api/files/*` (requireAuth + `canReadStoredFile()` permission check against D1 metadata) with:

```ts
headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
headers.set('Cache-Control', 'private, max-age=3600');
headers.set('ETag', object.httpEtag);
// SVG: Content-Disposition: attachment + CSP "default-src 'none'; style-src 'unsafe-inline'; sandbox"
```

Key layouts (immutable; renames change only D1):

```
photos/{uuid}/original.{ext} | thumb.{ext} | display.{ext}
library/{folderId}/{uuid}-{sanitized-filename}
attachments/...   (page editor uploads)
```

- D1 holds metadata (keys, mime, size, dimensions, caption, order, uploader, folder/event).
- Uploads: multipart `FormData`; validate MIME allowlist (PDF + images; reject Office docs with "convert to PDF" message), ~20 MB cap → 413/415. Duplicate filename in folder → 409 unless `replace` is explicit (replace keeps id + key).
- Delete D1 row **and** R2 objects together.
- **Image resizing happens in the browser** (`src/lib/photo-resize.ts`, never imported by the Worker): `createImageBitmap(file, { imageOrientation: 'from-image' })` → canvas → thumb 400×400 center crop, display max 1920px, JPEG q=0.85 (WebP `toBlob` support is inconsistent). Upload original + thumb + display.
- PDFs viewed in-app with `vue-pdf-embed`/pdf.js (needs CSP `wasm-unsafe-eval`, `worker-src blob:`).

## AI help chat (Workers AI + Vectorize RAG)

Bindings (per env, separate index each):

```json
"ai": { "binding": "AI" },
"vectorize": [{ "binding": "HELP_INDEX", "index_name": "<app>-help-dev" }]
```

Models (`src/lib/help-rag.ts`):

```ts
export const HELP_EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';          // 384 dims
export const HELP_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
```

Create index: `bunx wrangler vectorize create <app>-help-dev --dimensions=384 --metric=cosine`.

`POST /api/chat/query` pipeline: requireAuth → per-user in-memory limit (20/min) → body ≤ 8 KB, question ≤ 1000 chars, history ≤ 6 user/assistant msgs → embed → `HELP_INDEX.query(vector, { topK: 5, returnMetadata: 'all' })` → **filter by audience** (member vs staff docs by role) → grounded prompt ("answer only from these sources; say you don't know otherwise") → return `{ answer, sources }`.

Indexing (`bun run index:help -- --env dev|staging|production`, `scripts/index-help-docs.ts`): reads `src/content/docs/*.md` (skip `index.md`) → chunk by heading/paragraph with title+section prefix → stable sha256 chunk ids → embed in batches of 50 via Cloudflare REST API (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` in `.env`) → upsert batches of 100 → delete stale ids using `scripts/help-index-manifest.<env>.json` (commit the manifests).

UI: `HelpChatWidget.vue` mounted once in `App.vue` (floating, authenticated pages only), shows source links.

The same docs render at `/help` — one corpus serves both humans and the AI.

## Markdown pipeline

`src/lib/markdown.ts`: markdown-it (`html: true`, `linkify`) + `markdown-it-task-lists` + `markdown-it-container` (`::: info|warning|danger|row|document`) + `markdown-it-attrs` (allowlist `class, width, height, style, id, align`) + auto `tel:` links. Output → DOMPurify (`src/lib/sanitize.ts`) → `v-html` inside `.markdown-body` (github-markdown-css + callout CSS in `style.css`). Editor: CodeMirror 6 with `@codemirror/lang-markdown`.

## Activity logs & ops views

- `activity_logs` written by helpers (`logUserManagementChange`, etc.) for every admin mutation: actor, target, category (`access_control`, `page`, `directory`, `user_management`…), action, details JSON.
- `/api/admin/log-viewer/logs?q=&category=` (newest first, limit 200) → `AdminLogsView` (search + category select).
- `AdminStatusView`: counts from D1 (users, sessions, requests, content) + weekly/monthly/quarterly active users from `sessions.last_seen_at` (cumulative windows, not exclusive buckets).
- `AdminLastSeenView`: sessions grouped by user.
- Runtime logs: `observability.enabled: true` in wrangler + `just logs-prod` (`wrangler tail`).
- No cron in parkhillfw. If needed: `"triggers": { "crons": ["0 13 * * *"] }` and export `{ fetch: app.fetch, scheduled }`.
