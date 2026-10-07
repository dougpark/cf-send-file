# Task runner for this app. `just` lists recipes. All commands use Bun + Wrangler.

default:
    @just --list

# ------------------------------------------------------------------------------
# Local development
# ------------------------------------------------------------------------------

# Install dependencies
install:
    bun install

# Vite (HMR) + wrangler dev together; open the Vite URL
dev:
    bun run dev

# Same as dev, but without remote bindings (no Cloudflare login; help chat disabled)
dev-local:
    bun run dev:local

# Build the SPA into dist/ and serve it through wrangler only
preview: build
    bunx wrangler dev

# Build frontend assets into dist/
build:
    bun run build

# Typecheck the worker, run tests, and build
check:
    bun run check

# Generate a migration from src/db/schema.ts changes (e.g. just generate add_widgets)
generate name:
    bun run db:generate --name {{name}}

# Apply D1 migrations to the local database
migrate-local:
    bun run db:migrate:local

# Create or promote an Owner/Admin account in the LOCAL database
seed-admin email:
    bunx wrangler d1 execute DB --local --command "INSERT INTO users (email, is_member, is_owner, is_admin, created_at, updated_at) VALUES (lower('{{email}}'), 1, 1, 1, unixepoch(), unixepoch()) ON CONFLICT(email) DO UPDATE SET is_member = 1, is_owner = 1, is_admin = 1, is_suspended = 0;"

# Role-by-role permission smoke test using DEV_BYPASS_ROLE (needs migrated local DB)
permission-smoke:
    bash scripts/permission-smoke.sh

# Stop vite / wrangler dev processes started from this project
stop:
    -pkill -f "$PWD/node_modules/.bin/vite"
    -pkill -f "$PWD/node_modules/.*wrangler"
    -pkill -f "workerd serve"
    @echo "Stopped dev servers."

# Rebuild the dev Vectorize help index from src/content/docs (needs CLOUDFLARE_* env vars)
index-help:
    bun run index:help --env dev

# ------------------------------------------------------------------------------
# Staging
# ------------------------------------------------------------------------------

migrate-staging:
    bun run db:migrate:staging

deploy-staging:
    bun run deploy:staging

seed-admin-staging email:
    bunx wrangler d1 execute DB --env staging --remote --command "INSERT INTO users (email, is_member, is_owner, is_admin, created_at, updated_at) VALUES (lower('{{email}}'), 1, 1, 1, unixepoch(), unixepoch()) ON CONFLICT(email) DO UPDATE SET is_member = 1, is_owner = 1, is_admin = 1, is_suspended = 0;"

index-help-staging:
    bun run index:help:staging

logs-staging:
    bunx wrangler tail --env staging

# ------------------------------------------------------------------------------
# Production
# ------------------------------------------------------------------------------

migrate-prod:
    bun run db:migrate:prod

deploy-prod:
    bun run deploy:prod

seed-admin-prod email:
    bunx wrangler d1 execute DB --env production --remote --command "INSERT INTO users (email, is_member, is_owner, is_admin, created_at, updated_at) VALUES (lower('{{email}}'), 1, 1, 1, unixepoch(), unixepoch()) ON CONFLICT(email) DO UPDATE SET is_member = 1, is_owner = 1, is_admin = 1, is_suspended = 0;"

index-help-prod:
    bun run index:help:prod

logs-prod:
    bunx wrangler tail --env production
