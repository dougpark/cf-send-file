# Auth, Sessions, Roles & Security

Passwordless. A user proves control of an email via **either** a magic link **or** a 6‑digit code sent in the same email. Sessions are opaque random IDs stored (hashed) in D1 — no JWTs.

Reference code: `src/lib/auth.ts`, `src/lib/session.ts` (client logout), `src/middleware/auth.ts`, `src/middleware/security.ts`, `src/views/LoginView.vue`, `src/views/VerifyView.vue`, tests in `src/lib/auth*.test.ts`.

## Tables

| Table | Columns | Notes |
| --- | --- | --- |
| `users` | id, email, (app link fields), is_owner, is_admin, is_page_editor, is_directory_editor, is_finance, is_suspended, last_login_at, created_at, updated_at | Flag-based roles; additive |
| `user_login_emails` | id, user_id, email, created_at | Alternate login addresses for one canonical account |
| `magic_tokens` | id, email, token (sha256), code_hash (sha256), code_attempts, expires_at, created_at | **One row per email**; link + code share it |
| `sessions` | id (sha256 of raw cookie), user_id, expires_at, user_agent, ip_address, last_seen_at, created_at | Per device |
| `magic_link_rate_limits` | email (pk), minute_started_at, daily_started_at, daily_count | 1/min, 10/day |
| `access_requests` | id, email, full_name, …, status (pending/approved/rejected), reviewed_by_user_id, reviewed_at, notes | Optional "request access" workflow |
| `activity_logs` | actor_user_id, target_user_id, category, action, details, created_at | Audit trail for admin mutations |

## Login flow

```
LoginView (email) ─POST /api/auth/request-link─► rate limit → delete old tokens for email
                                                 → create {rawToken, rawCode} → store hashes (15 min TTL)
                                                 → EMAIL.send(link + code)
                                                 ← always "A sign-in link and code are on their way."
   ├─ user types code ─POST /api/auth/verify-code {email, code}
   │      atomic: UPDATE code_attempts = code_attempts+1 WHERE attempts < 5 → compare hash → delete row
   └─ user clicks link → /auth/verify?token=… (VerifyView shows a "Click to Confirm Login" button)
          ─POST /api/auth/verify {token}  → DELETE … RETURNING id (only one winner) → completeLogin()
completeLogin(): find user by email or alt email → else create (auto-link to domain record if safe)
                 → reject suspended → last_login_at → createSession() → Set-Cookie
```

Key rules (each one fixed a real problem):

- **Never consume a credential on GET.** Email security scanners prefetch links. The link only opens a page; a button POSTs the token.
- **Hash everything at rest** (token, code, session id) with SHA‑256 via `crypto.subtle`.
- **Single use via `DELETE … RETURNING`** — whoever deletes the row wins; parallel redemptions fail.
- **Code brute-force cap**: atomic increment with `WHERE code_attempts < 5`; after 5 misses the row is gone.
- **No account enumeration**: identical response for unknown, known, and suspended emails (suspended just doesn't get mail).
- **Token generation**: `crypto.randomUUID()` ×2 (hyphens stripped) for the link; `crypto.getRandomValues` for the zero-padded 6‑digit code.
- **Code input**: `type="text" inputmode="numeric" autocomplete="one-time-code" pattern="\d{6}" maxlength="6"` (iOS/Android autofill from email).

## Sessions

- Cookie: `<app>_session=<raw uuid>; Path=/; HttpOnly; SameSite=Lax; Max-Age=…; Secure` (Secure when HTTPS). No `Domain` → host-scoped.
- Lifetime **400 days**, **rolling**: when < 300 days remain, extend and re-send the cookie.
- `requireAuth()` hashes the cookie, loads session + user, rejects expired/suspended → 401.
- `last_seen_at` updated **at most every 15 min** per session (throttled write). The *previous* value is exposed via `/api/auth/me` as `lastActiveAt` for a "last active" banner. Admin "Last Seen" view aggregates sessions per user.
- **Logout** (`POST /api/auth/logout`): delete session row, expire cookie, send `Clear-Site-Data: "cache", "storage"`. Client (`src/lib/session.ts`) *also* clears localStorage, sessionStorage, cookies, Cache Storage, service workers, IndexedDB (Safari ignores Clear-Site-Data), then hard-navigates to `/login?switch=1`.
- Admins can force-logout (delete a user's sessions) and suspend; suspension is checked at login **and** on every session lookup.

## Roles & authorization

Flags on `users`, helpers in `src/middleware/auth.ts`:

```ts
export const isAdmin = (u) => Boolean(u?.isAdmin || u?.isOwner);
export const isPageEditor = (u) => Boolean(u?.isPageEditor) || isAdmin(u);
// same pattern for isDirectoryEditor, isFinance
```

| Role | Can |
| --- | --- |
| Owner | Everything, incl. granting/removing Owner |
| Admin | Everything except Owner management |
| Page / Directory / Finance editor | Their feature area only |
| User | Authenticated content |

Middleware: `requireAuth`, `requireAdmin`, `requireOwner`, `requireAnyAdminRole`, `requirePageEditor`, `requireDirectoryEditor`, `requireFinance`, plus an app-specific "approved member" guard (`requireDirectory`). **Authentication ≠ authorization**: unknown emails can sign in but land on `/access-request` until approved.

Permissions UI (`AdminAccessControlView`): search users → toggle FilterChips per role → auto-save → write `activity_logs`. Only owners can toggle Owner; granting Owner implies Admin.

**Elevated-account protection**: if login auto-links an email to a domain record (e.g. resident), refuse when that record already belongs to an owner/admin/editor account. Otherwise anyone who can edit a record's email can become admin. Tested in `auth-security.test.ts`.

## Security middleware & headers

`securityHeaders()` on all responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`, HSTS on HTTPS, `Cache-Control: no-store` on API responses by default.

`sameOriginOnly(exempt)` on `/api/*`: for POST/PUT/PATCH/DELETE require `Origin` host === request host (fallback `Sec-Fetch-Site: same-origin`). This is the CSRF defense together with `SameSite=Lax`. Exempt signed webhooks only.

Static assets get CSP from `public/_headers`:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Consequence: **no inline scripts** — that's why the theme bootstrap is an external `public/theme-init.js`. `wasm-unsafe-eval` + `worker-src blob:` exist for pdf.js.

User-authored HTML (markdown) is sanitized with DOMPurify (`src/lib/sanitize.ts`), adding `rel="noopener noreferrer"` on `_blank` links. R2 file proxy forces `Content-Disposition: attachment` + sandbox CSP for SVG.

## Checklist for a new project

- [ ] Rename cookie (`<app>_session`) and localStorage keys.
- [ ] Sender address/domain verified for Cloudflare Email Sending in every environment.
- [ ] `DEV_BYPASS_AUTH` only in `.dev.vars`; confirm loopback-only check remains.
- [ ] Bootstrap first owner: sign in once, then `bunx wrangler d1 execute DB --local --command "UPDATE users SET is_owner=1, is_admin=1 WHERE email='you@…'"` (and `--remote --env …` per environment).
- [ ] Keep/port the auth tests.
