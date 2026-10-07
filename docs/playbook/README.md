# Cloudflare + Vue App Playbook

Reusable knowledge extracted from **parkhillfw** (a production neighborhood directory site) so the next web app starts from a proven base instead of from scratch.

Three layers work together:

1. **Starter template repo** — working code (see [template-plan.md](./template-plan.md) for what to keep/cut).
2. **This playbook** — focused docs explaining *why* things are built the way they are.
3. **Personal agent skill** (`~/.copilot/skills/cloudflare-vue-starter/SKILL.md`) — tells the AI assistant where this playbook lives and how to use it in any new repo.

## Stack at a glance

| Layer | Choice |
| --- | --- |
| Runtime / package manager | Bun (never npm/pnpm/yarn) |
| Backend | Hono on Cloudflare Workers (V8 isolate, not Node) |
| Frontend | Vue 3 `<script setup lang="ts">` + Vite + vue-router |
| Styling | Tailwind CSS v4 with semantic theme tokens (`bg-surface`, `text-content`, `bg-accent`…) |
| Icons | `lucide-vue-next` |
| Database | Cloudflare D1 via Drizzle ORM |
| Files | Cloudflare R2 (private, served through authenticated Worker routes) |
| Email | Cloudflare Email Sending (`send_email` binding) |
| AI | Workers AI + Vectorize (RAG help chat) |
| Auth | Passwordless magic link **and** 6‑digit code, D1-backed 400‑day rolling sessions |
| Payments (optional) | Stripe Checkout + webhooks |
| Task runner | `just` |
| Tests | `bun test` |

## Docs in this folder

| File | Read when… |
| --- | --- |
| [architecture.md](./architecture.md) | Starting a project, adding routes, structuring the Worker or Vue app, writing tests |
| [deploy-and-environments.md](./deploy-and-environments.md) | Creating Cloudflare resources, wrangler config, dev/staging/prod, migrations, secrets |
| [auth.md](./auth.md) | Login, sessions, roles/permissions, route guards, security headers |
| [platform-services.md](./platform-services.md) | D1/Drizzle conventions, settings store, email, R2 uploads, AI/RAG, markdown, activity logs |
| [design-system.md](./design-system.md) | Any UI work: tokens, themes, buttons, cards, inputs, modals, mobile rules |
| [admin-ui.md](./admin-ui.md) | Building admin screens: two-column admin shell, settings, lists/tables, editors, logs |
| [lessons-learned.md](./lessons-learned.md) | **Before every new project** and before any risky change |
| [stripe-module.md](./stripe-module.md) | Only if the app takes payments |
| [template-plan.md](./template-plan.md) | Building / maintaining the starter template |
| [agent-instructions.template.md](./agent-instructions.template.md) | Copy into a new repo as `.github/copilot-instructions.md` / `AGENTS.md` / `CLAUDE.md` |

## Starting a new project (short version)

1. Create the repo from the starter template (or copy the "keep" list in [template-plan.md](./template-plan.md)).
2. Find/replace the app identifiers (`parkhillfw`, `parkhill_session`, `parkhill-theme`, site name, domain, sender email).
3. Create Cloudflare resources per environment ([deploy-and-environments.md](./deploy-and-environments.md#bootstrap-a-new-project)).
4. Copy [agent-instructions.template.md](./agent-instructions.template.md) into the new repo and fill in the project-specific sections.
5. Write `docs/intent.md` for the new product (what it does, who uses it, what's explicitly out of scope).
6. `bun install && bun run db:migrate:local && bun run dev`, sign in with the magic link, make yourself owner.

## Keeping this alive

- When you solve a non-obvious problem in *any* project on this stack, add one entry to [lessons-learned.md](./lessons-learned.md).
- When a pattern changes in code, update the matching playbook file in the same commit — stale docs are worse than none (see lesson "Instruction drift").
