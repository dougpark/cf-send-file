# Deploy & Environments

Three fully isolated environments. Every binding differs per environment — Worker name, domain, D1, R2, Vectorize index, secrets.

| Env | Worker | Domain | D1 | R2 | Vectorize |
| --- | --- | --- | --- | --- | --- |
| dev (top-level / `--local`) | `<app>` | localhost | `<app>-db-dev` | `<app>-bucket-dev` | `<app>-help-dev` |
| staging (`--env staging`) | `<app>-staging` | `staging.<domain>` | `<app>-db-staging` | `<app>-bucket-staging` | `<app>-help-staging` |
| production (`--env production`) | `<app>-prod` | `<domain>`, `www.<domain>` | `<app>-db` | `<app>-bucket` | `<app>-help-prod` |

## wrangler.json template

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "<app>",
  "account_id": "<account>",
  "main": "src/index.ts",
  "compatibility_date": "<today>",
  "workers_dev": false,
  "preview_urls": false,
  "observability": { "enabled": true },
  "assets": { "directory": "./dist", "binding": "ASSETS",
              "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "ai": { "binding": "AI" },
  "vectorize": [{ "binding": "HELP_INDEX", "index_name": "<app>-help-dev" }],
  "send_email": [{ "name": "EMAIL", "remote": true }],
  "d1_databases": [{ "binding": "DB", "database_name": "<app>-db-dev", "database_id": "…", "migrations_dir": "migrations" }],
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "<app>-bucket-dev" }],
  "vars": { "EMAIL_FROM": "support@<domain>" },
  "env": {
    "staging": {
      "name": "<app>-staging",
      "routes": [{ "pattern": "staging.<domain>", "custom_domain": true }],
      // ⚠ bindings are NOT inherited by named envs — repeat ai, vectorize, send_email, d1, r2, vars
    },
    "production": {
      "name": "<app>-prod",
      "routes": [{ "pattern": "<domain>", "custom_domain": true }, { "pattern": "www.<domain>", "custom_domain": true }],
      // repeat every binding with production names
    }
  }
}
```

`assets`, `main`, `compatibility_date`, `observability` are inherited; **bindings and vars are not** — forgetting one in an env silently leaves it undefined there.

## Bootstrap a new project

```bash
bun install
bunx wrangler login
for e in dev staging; do
  bunx wrangler d1 create <app>-db-$e
  bunx wrangler r2 bucket create <app>-bucket-$e
  bunx wrangler vectorize create <app>-help-$e --dimensions=384 --metric=cosine
done
bunx wrangler d1 create <app>-db
bunx wrangler r2 bucket create <app>-bucket
bunx wrangler vectorize create <app>-help-prod --dimensions=384 --metric=cosine
# paste database_ids into wrangler.json
```

Then in the Cloudflare dashboard:
1. Add the domain zone (DNS on Cloudflare).
2. Email Sending: onboard the sending domain (adds SPF/DKIM/DMARC records) and verify the `from` address.
3. Custom domains are created automatically on first deploy from `routes[].custom_domain`.

Secrets (never in wrangler.json):

```bash
bunx wrangler secret put STRIPE_SECRET_KEY --env staging      # repeat per env/secret
```

Local files (both gitignored):
- `.dev.vars` — secrets for `wrangler dev` (e.g. `STRIPE_SECRET_KEY`, `DEV_BYPASS_AUTH=true`, `DEV_BYPASS_ROLE=admin`).
- `.env` — for bun scripts calling the Cloudflare REST API (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- Commit a `.env.example` / `.dev.vars.example` listing names only.

## Local development

```bash
bun run db:migrate:local   # wrangler d1 migrations apply DB --local
bun run dev                # wrangler dev (:8787) + vite (:5173, proxies /api); open :5173
just dev                   # alt: build then wrangler dev only (tests the real asset serving)
just stop                  # kill stray vite/wrangler/workerd processes
```

Local D1/R2 state lives in `.wrangler/state` (gitignored). Remote-flagged bindings (EMAIL) hit real Cloudflare even in dev.

## Migrations

```bash
# 1. edit src/db/schema.ts
bun run db:generate                 # drizzle-kit generate → migrations/NNNN_name.sql + meta/
# 2. READ the SQL (renames can become drop+create!)
bun run db:migrate:local
# 3. test locally, then:
bun run db:migrate:staging          # --remote --env staging
bun run db:migrate:prod             # --remote --env production
```

Rules:
- Commit SQL **and** `migrations/meta/*` (journal + snapshots) together. Fix the journal after rebases/merges.
- **Migrate before deploying** code that needs the new schema; prefer additive changes (new nullable column) so old code keeps working during rollout.
- Name migrations meaningfully: `bun run db:generate --name pages_events` → `0025_pages_events.sql` (don't rename files by hand; the journal references them).
- Keep data backfills idempotent so a re-run is harmless.

## Deploy

```bash
just deploy-staging   # vite build && wrangler deploy --env staging
just deploy-prod      # vite build && wrangler deploy --env production
just logs-prod        # wrangler tail --env production
```

Production is always an explicit command. The bare `wrangler deploy` (top-level env) should not point at production.

Release checklist: `bun test` → `bun run build` → migrate staging → deploy staging → smoke test on staging (login email arrives, admin loads, uploads work) → migrate prod → deploy prod → reindex help docs if they changed (`bun run index:help -- --env production`).

## Data sync (prod → staging/local)

`just sync-prod-to-staging-full` / `sync-prod-to-local-full`: `wrangler d1 export` prod → split `INSERT`s per table → `DELETE` target tables → import in FK dependency order, one table per `d1 execute` (large single files fail) → self-referencing tables inserted with NULL parent then `UPDATE`d. **Skips** `d1_migrations`, `sessions`, `magic_tokens`, rate-limit tables. Destructive; R2 objects are not copied.

## Environment-scoped test-data resets

Provide `just reset-<feature>-local` / `-staging` recipes for anything with external side effects (e.g. delete Stripe test customers referenced in that env's D1, then clear tables). Never share IDs across environments.

## justfile skeleton

```make
default:
    @just --list
build:
    bun run build
migrate-local:
    bun run db:migrate:local
dev: build
    bunx wrangler dev
migrate-staging:
    bun run db:migrate:staging
deploy-staging: build
    bun run deploy:staging
logs-staging:
    bunx wrangler tail --env staging
migrate-prod:
    bun run db:migrate:prod
deploy-prod: build
    bun run deploy:prod
logs-prod:
    bunx wrangler tail --env production
```

package.json scripts:

```json
"dev:worker": "wrangler dev",
"dev:vue": "vite",
"dev": "trap 'kill 0' EXIT INT TERM; bun run dev:worker & bun run dev:vue & wait",
"build": "vite build",
"deploy:staging": "bun run build && wrangler deploy --env staging",
"deploy:prod": "bun run build && wrangler deploy --env production",
"db:generate": "drizzle-kit generate",
"db:migrate:local": "wrangler d1 migrations apply DB --local",
"db:migrate:staging": "wrangler d1 migrations apply DB --remote --env staging",
"db:migrate:prod": "wrangler d1 migrations apply DB --remote --env production",
"index:help": "bun scripts/index-help-docs.ts",
"test": "bun test"
```
