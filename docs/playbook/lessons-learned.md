# Lessons Learned

Hard-won rules from building parkhillfw (~215 commits). Read before starting a project and before risky changes. Format: **rule** — why (evidence).

## Cloudflare, Wrangler & environments

1. **Separate dev / staging / prod for every binding from day one.** — The first `wrangler.json` pointed straight at production; it was rebuilt with per-env Worker, domain, D1, R2, Vectorize (`3c713a4`, `wrangler.old.json`).
2. **Named envs don't inherit bindings.** — Repeat `ai`, `vectorize`, `send_email`, `d1_databases`, `r2_buckets`, `vars` in each `env` block; a missing one is silently `undefined` in that env.
3. **Production deploys are explicit commands** (`just deploy-prod`). The top-level `wrangler deploy` must not target prod.
4. **Show an environment banner** on localhost/staging (fail closed: unknown host = no banner) so nobody edits staging thinking it's prod (`e0bdb83`).
5. **Migrate, then deploy; make migrations additive.** Migration and deploy are separate deliberate steps per env.
6. **Delete or clearly archive obsolete configs/docs.** `wrangler.old.json` and outdated docs invite copy-paste of wrong commands.
7. **Prod→staging sync is destructive and must skip security tables** (sessions, magic tokens, rate limits, `d1_migrations`); import one table per request in FK order; self-referencing tables need NULL-then-UPDATE (justfile `sync-*`).
8. **`run_worker_first: ["/api/*"]` + JSON 404 for unknown `/api/*`.** Otherwise a typo'd API path returns the SPA HTML with 200 and the frontend chokes on JSON parse.
9. **Remote bindings reach real services in dev.** `send_email` with `remote: true` sends real mail locally; `getPlatformProxy()` scripts must pass `remoteBindings` explicitly.
10. **CSP forbids inline scripts** → anything that must run before paint (theme) is an external file in `public/`.

## D1, Drizzle & data

11. **Every externally retried event needs a unique index as its idempotency key.** Duplicate Stripe payments until `stripe_invoice_id` became unique (`892b4bb`, migration 0024).
12. **Commit migration SQL and `meta/` journal/snapshots together**; inspect after rebases (`fed0039`).
13. **Seed/import scripts must tolerate blank, duplicate, partial data and re-runs** (`0aa164a`).
14. **Store money as integer cents; store fees separately.**
15. **Define metric semantics before queries** — active-user windows are cumulative (24h ⊂ 7d ⊂ 30d ⊂ 90d), not exclusive buckets (`docs/recency-buckets.md`).
16. **Dates are business policy**: write down period boundaries, fiscal year, timezone before coding (`docs/f-qtrly-payments.md`). Keep date math in pure tested functions (`event-date.ts`).
17. **Key/value `settings` table** avoids a migration for every new config knob — but whitelist editable keys server-side.
18. **Use stable user IDs for authorization, never email equality.** Duplicate accounts caused wrong access (`bbc3674`, `bd2640c`).

## Auth & email

19. **Never consume a magic link on GET** — mail scanners prefetch. Link opens a page; a button POSTs.
20. **Send link + 6‑digit code together** — code works when the link opens in a different browser/app (iOS mail in-app browser problem). Same DB row, so using one kills the other.
21. **Atomic attempt counter** (`UPDATE … WHERE attempts < 5`) and **`DELETE … RETURNING`** for single use — read-then-write races otherwise.
22. **Identical response for unknown/known/suspended emails** (no enumeration). Rate limit per email (1/min, 10/day).
23. **Auto-linking a login email to a domain record must never grant elevated access** (`auth-security.test.ts`).
24. **Long rolling sessions (400 d) need revocation**: server-side rows, suspend, force logout, per-device list.
25. **Logout must defeat caches**: `Clear-Site-Data` + client clears storage (Safari ignores the header) + bfcache `pageshow` re-check (`src/main.ts`).
26. **Centralize operational email addresses in config** — recipients were hard-coded in several places and drifted (`763ac20`, `4beac4f`, `d627d69`).
27. **Separate login identity from display identity** for alias emails (`782fbc2`, `707f3e7`).
28. **Always send `text` + `html`, inline CSS, escape all user input.**

## R2, files & images

29. **Resize in the browser** (thumb 400 square, display 1920 max, JPEG 0.85, EXIF orientation via `createImageBitmap`) — never store/serve raw camera files only (`fed0039`).
30. **Object keys are immutable UUID paths; folders/names live in D1.** Renames never move objects.
31. **Private bucket + authenticated proxy route with a per-key permission check**; force download + sandbox CSP for SVG.
32. **Model links by kind** (download vs in-app viewer vs external URL) (`6e3073b`).
33. **Test folder navigation states**: root, nested, empty, back (`3689bed` — duplicated back buttons).
34. **Reject Office uploads with a "convert to PDF" message** — one viewer (pdf.js) to support.

## Frontend, Vue, Tailwind, mobile

35. **iOS zooms inputs < 16px** → global 16px rule for inputs on small screens (`1d70bff`).
36. **Test with long real content**; nav cards broke on long titles (`b60a8c5`).
37. **Mobile gets its own IA** (bottom nav) rather than a shrunken desktop (`509d710`).
38. **`tel:`/`sms:`/`mailto:` on dedicated buttons; test on real devices** (`7f5d757`, `36233d9`).
39. **Blank field → hide label and value.**
40. **Semantic color tokens only** (`bg-surface`, `text-content`) — themes/dark mode then cost nothing.
41. **Separate structure editing from content editing**; no delete buttons in drag/reorder mode; one "Add item" entry point (`docs/simplify-pages.md`).
42. **Route guards are UX; the API is the security boundary.**
43. **Search: debounce 250 ms, min 2 chars, request token to drop stale responses.**
44. **Split the Worker into route modules early** — a single 3800-line `src/index.ts` is painful for humans and AI context.

## AI / RAG

45. **One Vectorize index per environment**; reindex is a scripted, manifest-driven step (`bdcec1e`).
46. **One markdown corpus serves `/help` and the AI** — writing help docs improves both.
47. **Filter retrieved chunks by audience/role** before prompting; hard limits on input size, history length, and per-user rate.
48. **Ground the prompt** ("answer only from sources; say you don't know") and return sources to the UI.

## Payments

49. **Webhook = truth; redirect = UX.** Verify signature on the raw body. See [stripe-module.md](./stripe-module.md).
50. **Build environment-scoped reset tooling with any external side-effect feature** (`89f474a`).

## Working with AI agents

51. **Instruction drift is real.** `CLAUDE.md` still describes a blue "Gemini-Modern" palette and a `BaseButton.vue` that doesn't exist; `docs/intent.md` says Amazon SES but the app uses Cloudflare Email. Update instructions in the same commit as the code change.
52. **Write a short plan doc with acceptance criteria before broad UI changes** (`docs/simplify-pages.md`, `docs/stripe_plan_1.md`).
53. **Inventory existing patterns before adding new abstractions** — reuse routes, permissions, components.
54. **Write scope exclusions down** (`docs/feature_creep.md`): explicitly rejected ideas stop creep.
55. **Every task names its verification step** (`bun test`, `bun run build`, a specific screen on mobile).
56. **Prompt shape that works**: screen → exact behavior → acceptance criteria → edge cases/exclusions → validation (`.github/prompts/ui-fix.prompt.md`).
57. **Compact/reset long agent conversations**; encode conventions once in instructions instead of rediscovering them.
