# cf-vue-starter

A full-stack starter for members-only web apps on Cloudflare, extracted from a production project. It includes passwordless sign-in, an admin area, settings, activity logs, color themes, transactional email, and a help assistant built on retrieval-augmented generation (RAG).

**Stack:** Bun · Cloudflare Workers + [Hono](https://hono.dev) · D1 (SQLite) via Drizzle · R2 · Workers AI + Vectorize · Cloudflare Email · Vue 3 + Vite · Tailwind CSS v4.

## What's included

| Area | Details |
| --- | --- |
| Auth | Magic link and 6-digit code sign-in, long-lived sessions, sign-in alias emails, suspended accounts, rate limits |
| Access | Members-only by default. New users submit an access request and an admin approves it. Optional **open sign-up** setting |
| Roles | Owner, Admin, Editor, plus member and guest. Guards live in `src/middleware/auth.ts` |
| Admin area | Status, Access Requests, Login Accounts (membership, suspend, sessions, sign-in links), Permissions, Logs, Last Seen, Settings |
| Settings | Key/value `settings` table with a server-side whitelist (site name, admin email, open sign-up) |
| UI | Mobile-first layout with a bottom nav on phones, an account menu, About modal, semantic color tokens and multiple themes (`src/style.css`) |
| Help | Markdown guides in `src/content/docs/` power the Help Center and an AI help assistant (Vectorize + Workers AI) |
| Email | Branded HTML emails through the Cloudflare `send_email` binding (`src/lib/email.ts`) |
| Security | CSP and security headers, same-origin checks on writes, owner-protection rules, a loopback-only dev auth bypass |
| Tests | `bun test`: auth flows, security middleware, route permission guards, help RAG |

R2 (`BUCKET`) is bound but unused, ready for uploads. The reusable patterns (uploads, Stripe dues, page editor and more) are documented in [`docs/playbook/`](docs/playbook/README.md).

## Quick start (local)

Prerequisites: [Bun](https://bun.sh), and optionally [just](https://github.com/casey/just).

```bash
bun install
bun scripts/init-project.ts "Acme Portal" acme-portal   # optional: rename my-app → your app
bun run db:migrate:local
just seed-admin you@example.com                         # makes you Owner + Admin locally
bun run dev:local                                       # Vite on :5173, Worker on :8787 (no Cloudflare login)
```

`bun run dev:local` runs the Worker with remote bindings off, so it needs no Cloudflare account. The help chat returns 503 because Workers AI and Vectorize have no local mode. After `bunx wrangler login`, use `bun run dev` to get the AI binding too.

Open http://localhost:5173 and sign in with the seeded email. Locally, Wrangler simulates the email binding and doesn't deliver mail; it logs where each message was saved, so open that file to get the link or code. Alternatively, skip sign-in with the dev bypass:

```bash
cp .dev.vars.example .dev.vars   # DEV_BYPASS_AUTH=true, DEV_BYPASS_ROLE=owner|admin|editor|member|guest
```

The bypass only works for loopback (localhost) requests, so it can never open a deployed Worker.

## Common commands

| Command | Purpose |
| --- | --- |
| `bun run dev:local` | Worker + Vite with HMR, no Cloudflare login (AI/help chat disabled) |
| `bun run dev` | Same, with the remote AI binding (needs `bunx wrangler login`) |
| `bun run check` | Typecheck + tests + production build (also run in CI) |
| `bun run db:generate --name <x>` | Generate a migration after editing `src/db/schema.ts` |
| `bun run db:migrate:local` | Apply migrations locally |
| `just permission-smoke` | Hit every admin endpoint as each role (runs `wrangler dev --local`; no login needed) |
| `bun run index:help` | Re-embed help guides into Vectorize (needs a Cloudflare login) |
| `just deploy-staging` / `just deploy-prod` | Build and deploy |

Run `just` to list every recipe.

## Deploying to Cloudflare

1. `bunx wrangler login`
2. Create D1 databases and paste each `database_id` into `wrangler.json` (replacing the `REPLACE_WITH_*_D1_ID` placeholders):
   ```bash
   bunx wrangler d1 create my-app-db-dev
   bunx wrangler d1 create my-app-db-staging
   bunx wrangler d1 create my-app-db-prod
   ```
3. Create R2 buckets and Vectorize indexes (the embedding model is `bge-small-en-v1.5`, which has 384 dimensions):
   ```bash
   for e in dev staging prod; do
     bunx wrangler r2 bucket create my-app-bucket-$e
     bunx wrangler vectorize create my-app-help-$e --dimensions=384 --metric=cosine
   done
   ```
4. Email: onboard your domain to Cloudflare Email Routing, verify a sender, and set `MAIL_FROM` in each `wrangler.json` environment.
5. Set the `routes` for staging and production in `wrangler.json` to your domains.
6. Migrate, deploy, seed and index:
   ```bash
   just migrate-staging && just deploy-staging
   just seed-admin-staging you@example.com
   just index-help-staging
   ```
   Repeat with `-prod`.

## Project layout

```
src/
  index.ts              Worker entry: security middleware, route mounting, SPA fallback
  routes/               API route modules (auth, account, settings, help, admin/*)
  middleware/           auth guards + roles, security headers/same-origin
  lib/                  auth (tokens/sessions), email, settings, help RAG, config
  db/schema.ts          Drizzle schema (single source of truth)
  views/ components/    Vue SPA (Admin*View.vue = admin features)
  content/docs/         Help guides (also the help assistant's knowledge)
migrations/             Generated SQL migrations; commit these
scripts/                init-project, help indexer, permission smoke test
docs/playbook/          Reusable knowledge from the original project
```

## Adding a feature

1. Add tables to `src/db/schema.ts`, then run `bun run db:generate --name <feature>` and `bun run db:migrate:local`.
2. Add `src/routes/<feature>.ts` with guards (`requireAuth()`, `requireMember()`, `requireAdmin()`…) and mount it in `src/index.ts`.
3. Add a view and a route in `src/router/index.ts`, then a nav item in `src/App.vue`. For admin tools, add an entry to the menu in `src/views/AdminView.vue`.
4. Write a help guide in `src/content/docs/`, then run `bun run index:help`.
5. Run `bun run check`.

Describe your app's purpose, roles and exclusions in [`docs/intent.md`](docs/intent.md); AI agents read it via `CLAUDE.md` and `.github/copilot-instructions.md`.
