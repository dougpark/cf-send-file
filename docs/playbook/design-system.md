# Design System (Tailwind v4, semantic tokens, 3 themes)

The look: warm, calm, rounded, high-breathability. Rounded-full buttons and chips, rounded-3xl cards, thin borders, subtle shadows, muted secondary text, one coral accent. Light/dark via `data-theme` on `<html>`, **not** Tailwind's `dark:` variant.

> Note: older instructions in parkhillfw (`CLAUDE.md`) describe a "Gemini-Modern" blue palette (`#1a73e8`). That is now just the `original` theme. The default is `modern-lite`. Always use the **semantic classes** below, never raw hex in components.

## Tokens (`src/style.css`)

```css
@import "tailwindcss";

:root,
:root[data-theme="modern-lite"] {          /* default */
  color-scheme: light;
  --theme-app-bg: #f4f1ea;  --theme-surface: #ffffff;
  --theme-surface-subtle: #f1f4ef;  --theme-surface-hover: #f3ede8;
  --theme-text: #1e2f23;  --theme-text-muted: #52685a;
  --theme-accent: #e07a5f;  --theme-accent-secondary: #81b29a;
  --theme-border: #d7ded8;  --theme-on-accent: #ffffff;
  --theme-success: #356b4d;  --theme-success-subtle: #e7f2eb;
  --theme-warning: #805b18;  --theme-warning-subtle: #fff4d6;
  --theme-danger: #a63832;  --theme-danger-subtle: #fff0ed;  --theme-danger-border: #e5aaa2;
}
:root[data-theme="modern-dark"] {
  color-scheme: dark;
  --theme-app-bg: #2b2d42;  --theme-surface: #35384f;
  --theme-surface-subtle: #303247;  --theme-surface-hover: #40445d;
  --theme-text: #edf2f4;  --theme-text-muted: #8d99ae;
  --theme-accent: #ab5b49;  --theme-accent-secondary: #81b29a;
  --theme-border: #4b5068;  --theme-on-accent: #ffffff;
  --theme-success: #9ad7b0;  --theme-success-subtle: #234638;
  --theme-warning: #f4d06f;  --theme-warning-subtle: #4a4025;
  --theme-danger: #ff9b9b;  --theme-danger-subtle: #532d39;  --theme-danger-border: #874657;
}
:root[data-theme="original"] {             /* Google-ish blue */
  color-scheme: light;
  --theme-app-bg: #f0f4f9;  --theme-surface: #ffffff;
  --theme-surface-subtle: #f8fafd;  --theme-surface-hover: #f7faff;
  --theme-text: #1f1f1f;  --theme-text-muted: #444746;
  --theme-accent: #1a73e8;  --theme-accent-secondary: #7c4dff;
  --theme-border: #e1e3e1;  --theme-on-accent: #ffffff;
  --theme-success: #137333;  --theme-success-subtle: #e6f4ea;
  --theme-warning: #8a6116;  --theme-warning-subtle: #fff8e1;
  --theme-danger: #b3261e;  --theme-danger-subtle: #fff8f7;  --theme-danger-border: #f1b3b0;
}

@theme inline {
  --color-app-bg: var(--theme-app-bg);
  --color-surface: var(--theme-surface);
  --color-surface-subtle: var(--theme-surface-subtle);
  --color-surface-hover: var(--theme-surface-hover);
  --color-content: var(--theme-text);
  --color-content-muted: var(--theme-text-muted);
  --color-accent: var(--theme-accent);
  --color-accent-secondary: var(--theme-accent-secondary);
  --color-theme-border: var(--theme-border);
  --color-on-accent: var(--theme-on-accent);
  --color-success: var(--theme-success);
  --color-success-subtle: var(--theme-success-subtle);
  --color-warning: var(--theme-warning);
  --color-warning-subtle: var(--theme-warning-subtle);
  --color-danger: var(--theme-danger);
  --color-danger-subtle: var(--theme-danger-subtle);
  --color-danger-border: var(--theme-danger-border);
}

html, body { background: var(--theme-app-bg); }

/* iOS Safari zooms on focus if font-size < 16px */
@media (max-width: 640px) { input, select, textarea { font-size: 16px !important; } }
```

Utility vocabulary: `bg-app-bg`, `bg-surface`, `bg-surface-subtle`, `hover:bg-surface-hover`, `text-content`, `text-content-muted`, `bg-accent`, `text-accent`, `bg-accent/10`, `text-on-accent`, `border-theme-border`, `bg-success-subtle text-success`, `bg-warning-subtle text-warning`, `bg-danger-subtle text-danger`, `border-danger-border`, `ring-accent/30`.

Font: system stack (no webfont). Headings `text-2xl font-semibold tracking-tight` (page), `text-xl font-semibold` (panel), `text-lg font-semibold` (section).

## Theme switching without flash

`index.html` `<head>`: `<meta name="theme-color">`, `<meta name="apple-mobile-web-app-status-bar-style">`, then `<script src="/theme-init.js"></script>` (external file because CSP forbids inline scripts). `public/theme-init.js` reads `localStorage['<app>-theme']`, validates, sets `document.documentElement.dataset.theme` and the theme-color meta. `useTheme()` (`src/composables/useTheme.ts`) exposes `{ theme, themeOptions, applyTheme }` and persists. Theme picker lives in the account menu.

## Shape & spacing scale

| Element | Radius | Typical classes |
| --- | --- | --- |
| Page/section card, list container, modal | `rounded-3xl` | `rounded-3xl border border-theme-border bg-surface p-6 shadow-sm` |
| Compact card, form card, dropdown popover | `rounded-2xl` | `rounded-2xl border border-theme-border bg-surface p-5` |
| Inputs, selects, alerts, small tiles | `rounded-xl` | see below |
| Buttons, chips, badges, icon buttons, search pill | `rounded-full` | see below |

Content padding `p-6 sm:p-8`; vertical rhythm `space-y-6` / `space-y-8` between sections; `gap-2`/`gap-3`/`gap-4` in rows.

## Components & class recipes

**Primary button**
`inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60` (+ Lucide icon `h-4 w-4`; label switches to "Saving…")

**Small primary**: `inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90`

**Secondary / outline**: `rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg`
Accent outline: `rounded-full border border-accent px-3 py-1.5 text-sm font-medium text-accent`

**Icon button**: `rounded-full p-2 text-content-muted hover:bg-app-bg` (always `aria-label`). Destructive: `rounded-full p-2 text-danger hover:bg-danger-subtle`. Mobile touch target: `h-11 w-11 inline-flex items-center justify-center rounded-full`.

**Text input** (`BaseInput.vue`, with left search icon + optional clear X):
`w-full rounded-xl border border-theme-border bg-surface pl-11 pr-11 py-3 text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all`
Compact input/select: `w-full rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30`

**Field group**: `<label class="mb-1 block text-sm font-medium text-content">` → input → `<p class="mt-1 text-xs text-content-muted">help</p>`

**FilterChip** (`FilterChip.vue`, a styled `sr-only` checkbox, v-model boolean):
base `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium cursor-pointer transition-all select-none`
on `border-accent bg-accent text-on-accent shadow-sm` · off `border-theme-border bg-surface text-content-muted hover:bg-app-bg`
Used for boolean filters *and* permission toggles. Text search + chips compose with AND.

**Badge**: `rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent`

**Alerts (inline, no toast system)**:
error `rounded-xl bg-danger-subtle p-3 text-sm text-danger` · success `rounded-xl bg-success-subtle p-3 text-sm text-success`
**Loading**: `text-sm text-content-muted` ("Loading settings…") · **Empty**: `rounded-3xl border border-theme-border bg-surface p-6 text-content-muted`

**List** (preferred over `<table>`, mobile-friendly):
```html
<ul class="divide-y divide-theme-border rounded-3xl border border-theme-border bg-surface">
  <li class="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">…</li>
</ul>
```

**ModalShell** (`ModalShell.vue`, props `title`, emits `close`, default slot):
backdrop `fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4` (`@click.self` closes) · panel `max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-theme-border bg-surface p-6 shadow-lg sm:p-8` · header `flex items-start justify-between gap-4`, title `text-lg font-semibold`, close X icon button.

**Popover / search results**: `absolute right-0 top-full z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-theme-border bg-surface shadow-lg`

**Breadcrumbs** (`BreadcrumbNav.vue`): `flex flex-wrap items-center gap-1 text-sm text-content-muted`, crumbs `rounded-full px-2 py-1 hover:bg-app-bg`, Home icon first, chevrons between, current crumb not a link.

## App shell (`App.vue`)

- **EnvironmentBanner**: fixed 32px strip at top, `bg-green-500 text-green-950` for localhost, `bg-amber-400 text-amber-950` for hosts containing `staging`, nothing otherwise (fail closed). Offset the header when shown.
- **Header**: logo (inline SVG via `?raw` import), site name from `useSiteSettings`, desktop nav items, `NavSearch` (desktop `sm:w-64` rounded-full input; mobile 44px icon → full-width popover), account menu (theme picker, about, sign out).
- **Mobile**: bottom nav bar for primary destinations; desktop: top nav. Different IA by breakpoint, not a shrunken desktop.
- Primary nav is a data array `{ key, label, to, icon, adminOnly? }`; Admin shown for any admin role.
- `HelpChatWidget` mounted once at shell level.
- "Last active" banner from `/api/auth/me` `lastActiveAt`.

## Mobile rules

- Touch targets ≥ 44–48px, 8–12px apart, `touch-action: manipulation`.
- Native `tel:`, `sms:`, `mailto:` links on dedicated action buttons — never make a whole row a phone link. Use an action sheet for multiple numbers.
- When a field is blank, hide label **and** value (no empty placeholders like "M:").
- Test with long real titles; allow wrapping (`min-w-0`, `truncate` deliberately).
- Test inputs on real iOS Safari (zoom, keyboard, autofill).

## Icons & branding

- `lucide-vue-next`, imported per icon, sized `h-4 w-4` (inline) / `h-5 w-5` (nav). Persisted icon names map through a **fixed registry** (`menuIcons.ts`), never dynamic component names from data.
- Favicons in `public/favicon/` (ico, svg, 96px png, apple-touch-icon, `site.webmanifest`) — generate with realfavicongenerator.
- Keep design sources (`.acorn`, large PNGs) in `assets-src/`, not `public/`.
