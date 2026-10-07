# Template Repo Plan

Goal: a GitHub **template repository** (working name `cf-vue-starter`) that boots a new app in minutes. It is derived from parkhillfw by keeping the platform, cutting the neighborhood domain, and renaming identifiers. This file is the checklist for building it.

## 1. Keep (platform)

| Area | Files |
|---|---|
| Config | `package.json`, `vite.config.ts`, `drizzle.config.ts`, `tsconfig*.json`, `wrangler.json` (IDs replaced), `justfile` (domain recipes removed), `index.html`, `public/_headers`, `public/theme-init.js`, `public/favicon/*` incl. `site.webmanifest` (placeholders) |
| Worker | `src/index.ts` (split into modules, see §4), `src/middleware/{auth,security}.ts` + tests, `src/lib/{auth,session,email,settings,sanitize,markdown,help-rag,photo-resize}.ts` + tests |
| Schema | `users` (role/permission columns), `user_login_emails`, `sessions`, `magic_tokens`, `magic_link_rate_limits`, `access_requests`, `activity_logs`, `settings`, `info_messages`; optional: `pages`, `menus`, `documents`, `document_folders`, `photo_folders`, `photo_events`, `photos` |
| Auth UI | `LoginView`, `VerifyView`, `AccessRequestView` |
| Admin | `AdminView` (shell + menu), `AdminSettingsView`, `AdminAccessControlView`, `AdminAccessRequestsView`, `AdminLoginUsersView`, `AdminUsersView`, `AdminLogsView`, `AdminStatusView`, `AdminLastSeenView` |
| Content modules (optional) | `AdminPages*`, `AdminMenusView`, `PageView`, `MenuView`, `components/menus/*`, `components/pages/*`, documents + library views, photos + gallery views, `HelpView` |
| UI | `components/ui/*`, `components/common/*`, `components/layout/{EnvironmentBanner,HelpChatWidget,NavSearch,SearchResultsList}`, `src/style.css`, `App.vue` shell, `composables/{useEnvironmentBanner,useTheme,useSiteSettings,useNavOrigin}.ts` |
| Scripts | `scripts/index-help-docs.ts` (+ empty manifests), `scripts/count-*.ts`, `permission-smoke.sh` (generalized) |
| Docs | `docs/playbook/` (copy, then let it evolve), a fresh `docs/intent.md` stub, `.github/copilot-instructions.md` + `CLAUDE.md` from [agent-instructions.template.md](./agent-instructions.template.md), `.github/prompts/ui-fix.prompt.md` |

## 2. Cut (parkhillfw domain)

- Directory domain: `households`, `residents`, `children`, `household_favorites`, `household_archive`, directory reminders; `DirectoryView`, `DirectoryEditView`, `HouseholdCard`, `PhoneActionSheet` (keep as a snippet in the playbook if useful), `AdminDirectoryView`, `AdminArchive*`, `AdminHouseholdResetView`, `src/lib/contact.ts`, `directory-reminder*`.
- Finance/Stripe → move to an **optional module** branch or folder (`modules/stripe/`) documented by [stripe-module.md](./stripe-module.md): `AdminFinance*`, `DuesPayView`, `src/lib/{stripe,stripe-webhooks,product-catalog,finance-report}.ts`, `subscriptions`/`payments` tables, Stripe `vars`, `reset-dues-*` recipes.
- Events (`EventsView`, `event-date.ts`) — optional module.
- `scripts/seed-*`, `export-*`, `run-seed-*`, `reset-directory-reminders.ts`, `conversion.justfile`, `data/`, `assets-src/`, `wrangler.old.json`, all `docs/*.md` except the playbook.
- All 26 migrations (`0000`–`0025`) → replaced by **one fresh baseline** (`bun run db:generate --name init`).

## 3. Rename / parameterize

| parkhillfw value | Template placeholder |
|---|---|
| `parkhill_session` cookie | `<app>_session` (const in `src/lib/auth.ts`) |
| `parkhill-theme` localStorage | `<app>-theme` (`theme-init.js` + `App.vue`) |
| `parkhillfw.admin.expandedSection` | `<app>.admin.expandedSection` |
| `support@parkhillfw.org` (hard-coded in `email.ts`) | `settings`/env var `MAIL_FROM` |
| "Park Hill Directory", site name defaults | `settings.site_name` default `My App` |
| `parkhillfw`, `-db-*`, `-bucket-*`, `-help-*`, domains | `<app>` in `wrangler.json`; IDs left as `REPLACE_ME` |
| `requireDirectory()` / "directory access" | generic `requireMember()` / `is_member` |
| Email theme colors | read from one `emailTheme` const |

Do it with one `scripts/init-project.ts` (Bun) that asks for app name + domain and rewrites these tokens, then deletes itself.

## 4. Improve while extracting

- Split `src/index.ts` into `src/routes/{auth,admin,settings,files,help,pages,...}.ts` (each `new Hono<AppEnv>()` mounted via `app.route()`), keep `index.ts` as wiring + fallbacks.
- Add `.env.example` and `.dev.vars.example` (names only, no values).
- Add a `bun run check` script = `vue-tsc --noEmit` + `bun test` + `vite build`.
- Add a minimal GitHub Actions CI running `bun install --frozen-lockfile && bun run check`.
- Fix the known drift: palette in `CLAUDE.md`, missing `BaseButton.vue` (create it or drop the mention), `intent.md` email provider.
- Seed script that creates the first admin user from `ADMIN_EMAIL` (replaces directory seeding).
- Mark repo as **Template repository** in GitHub settings.

## 5. Acceptance criteria

- `bun install && bun run db:migrate:local && just seed-admin && bun run dev` → log in by magic code (email visible in dev log / dev bypass), see admin shell with Settings, Users, Access Control, Logs, Status.
- `bun run check` passes; no `parkhill` string remains (`grep -ri parkhill` empty except playbook history).
- `just deploy-staging` works after filling IDs; production deploy remains an explicit command.
- Theme switcher (3 themes) and environment banner work.

## 6. New-project flow (after template exists)

1. GitHub → "Use this template" → clone.
2. `bun scripts/init-project.ts` → name, domain.
3. Create Cloudflare resources per env (commands in [deploy-and-environments.md](./deploy-and-environments.md)), paste IDs.
4. Write `docs/intent.md` (domain, roles, exclusions) **before** feature work.
5. Ask the agent: "Read docs/playbook/README.md and docs/intent.md, then propose the schema."
