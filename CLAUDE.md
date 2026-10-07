# My App — Agent Instructions

## Project
A members-only web app built from cf-vue-starter (magic-link auth, admin area, settings, help assistant). Product intent, roles and explicit exclusions: `docs/intent.md`.
Reusable stack knowledge: `docs/playbook/README.md` (architecture, auth, platform services, design system, admin UI, deploy, lessons learned). Read the relevant playbook file before changing that area.

## Stack & runtime (non-negotiable)
- Bun only: `bun install`, `bun run dev` (or `bun run dev:local` without a Cloudflare login), `bun run build`, `bun test`, `bunx wrangler …`. Never npm/pnpm/yarn.
- Cloudflare Workers runtime (not Node). Hono backend; Vue 3 + Vite SPA; Tailwind CSS v4; D1 via Drizzle; R2; Workers AI + Vectorize; Cloudflare Email.
- Bindings only via request context: `c.env.DB`, `c.env.BUCKET`, `c.env.AI`, `c.env.HELP_INDEX`, `c.env.EMAIL`.
- Static assets in `dist/` served by Workers Assets; `/api/*` runs the Worker first. No hand-written static file routes.

## Backend conventions
- Routes live in `src/routes/*.ts` (admin ones in `src/routes/admin/`) and are mounted in `src/index.ts`. Unknown `/api/*` → JSON 404.
- Use per-route guards (`adminUsers.get('/x', requireAuth(), requireAdmin(), …)`), never `subApp.use('*', guard)` on a sub-app mounted at a shared prefix — it leaks onto sibling sub-apps.
- Guards: `requireAuth()` then the role guard (`requireAdmin()`, …). The API is the security boundary; router guards are UX only.
- Errors: `c.json({ error: 'Human message.' }, status)` with 400/401/403/404/409/429.
- Schema only in `src/db/schema.ts`. Migrations: `bun run db:generate --name <x>` → `bun run db:migrate:local` → commit `migrations/` incl. `meta/`. Additive changes only.
- Any externally retried event (webhooks) needs a unique index as idempotency key.
- Config knobs go in the `settings` table (server-side whitelist), not new columns.
- Never put secrets in code or `wrangler.json`; use `wrangler secret put` / `.dev.vars`.

## Frontend conventions
- `<script setup lang="ts">`, Composition API only. `ref()` for primitives/arrays; `reactive()` sparingly.
- Components in `src/components/<feature>/`, views in `src/views/`. Admin tools are `src/views/Admin*View.vue`, registered in the menu array in `src/views/AdminView.vue`. Check `src/components/ui/` (`BaseInput`, `ModalShell`, `FilterChip`) before creating primitives.
- Colors: semantic tokens only — `bg-app-bg`, `bg-surface`, `bg-surface-subtle`, `text-content`, `text-content-muted`, `bg-accent text-on-accent`, `border-theme-border`, `text-success|warning|danger` (+ `-subtle`). Never raw hex in components.
- Shapes: `rounded-xl` cards/inputs, `rounded-3xl` modals/outer containers, `rounded-full` buttons/chips.
- Mobile-first; inputs ≥16px on mobile; test long text; blank field → hide label and value.
- Icons: `lucide-vue-next`.

## Workflow
- Understand the screen/request first; smallest patch that fixes the root cause; no unrelated refactors.
- For broad changes write a short plan in `docs/` with acceptance criteria and exclusions first.
- Verify with the smallest relevant command (`bun test <file>`, `bun run build`) and report the result. Don't claim completion without it.
- `bun run check` = typecheck + tests + build. `.vue` files are only checked by the Vite build.
- Production deploys/migrations only via explicit `just deploy-prod` / `just migrate-prod` when asked.

## Prompt shape
Screen → exact behavior → acceptance criteria → edge cases/exclusions → validation.
