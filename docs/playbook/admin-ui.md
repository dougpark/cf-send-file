# Admin UI Patterns

The admin area is one route (`/admin`, `meta: { requiresAnyAdminRole: true }`) rendering `AdminView.vue`: breadcrumbs + title + a **two-column card** (accordion nav on the left, selected panel on the right). Each panel is its own `AdminXxxView.vue` component. Styling rules come from [design-system.md](./design-system.md).

## Admin shell (`AdminView.vue`)

```html
<section class="space-y-6">
  <BreadcrumbNav :trail="breadcrumbTrail" :current="selectedFeature" @crumb-click="handleCrumbClick" />
  <h2 class="mt-1 text-2xl font-semibold tracking-tight">Administration</h2>

  <div class="grid min-h-112 rounded-3xl border border-theme-border bg-surface shadow-sm"
       :class="fullWidth ? 'md:grid-cols-1' : 'overflow-hidden md:grid-cols-[17rem_minmax(0,1fr)]'">
    <nav v-if="!fullWidth" aria-label="Admin features"
         class="border-b border-theme-border bg-app-bg p-3 md:border-b-0 md:border-r">
      <!-- section button -->
      <button class="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors"
              :class="active ? 'bg-surface text-accent shadow-sm' : 'text-content-muted hover:bg-surface/70'"
              :aria-expanded="hasChildren ? expanded : undefined">
        <component :is="section.icon" class="mt-0.5 h-5 w-5 shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ section.label }}</span>
          <span class="mt-0.5 block text-xs text-content-muted">{{ section.description }}</span>
        </span>
        <ChevronDown v-if="hasChildren" class="mt-1 h-4 w-4 shrink-0 transition-transform" :class="expanded && 'rotate-180'" />
      </button>
      <!-- children (indented) -->
      <div class="mt-1 space-y-1 pb-1 pl-8">
        <button class="block w-full truncate rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors"
                :class="selected ? 'bg-accent text-on-accent shadow-sm' : 'text-content-muted hover:bg-surface/70 hover:text-content'">…</button>
      </div>
    </nav>
    <div class="min-w-0 p-6 sm:p-8"><!-- selected panel component --></div>
  </div>
</section>
```

Menu is **data-driven and role-filtered**:

```ts
type Role = 'any' | 'admin' | 'directoryEditor' | 'pageEditor' | 'finance';
interface AdminFeature { label: string; description: string; icon: Component; role: Role; hidden?: boolean }
interface AdminMenuSection extends AdminFeature { disabled?: boolean; badge?: string; feature?: AdminFeature; children?: AdminFeature[] }

const adminMenuSections: AdminMenuSection[] = [
  { label: 'Status', description: 'Review database and request counts.', icon: Gauge, role: 'any', feature: {...} },
  { label: 'Site Content', description: 'Manage pages and navigation.', icon: FileText, role: 'pageEditor',
    children: [ { label: 'Pages', … }, { label: 'Navigation', … }, { label: 'Photos', … }, { label: 'Documents', … } ] },
  { label: 'User Management', icon: ShieldCheck, role: 'admin',
    children: [ { label: 'Access Requests' }, { label: 'Login Accounts' }, { label: 'Permissions' } ] },
  { label: 'Log Viewer', icon: ScrollText, role: 'any', children: [ { label: 'Logs' }, { label: 'Archives' }, { label: 'Last Seen' } ] },
  { label: 'Settings', icon: Settings, role: 'admin', feature: {...} },
];
```

Behavior:
- Permissions fetched from `/api/auth/me`; `allows(role)` filters sections/children (admin implies all editor roles).
- Only one parent expanded at a time; expanded section persisted in `localStorage` (`<app>.admin.expandedSection`).
- Default panel = `Status`. Breadcrumb trail mirrors section → child.
- **Full-width panels** (Pages, Events, Navigation, Photos, Documents, Permissions, big reports) hide the left nav and show their own "← Back" button (`rounded-full border border-theme-border px-4 py-2 …`) emitting `exit`.
- `hidden: true` children are valid targets reachable from another panel (e.g. a report list) but not shown in the nav.
- Unbuilt features: `disabled` + `badge: 'Coming soon'` rather than hiding them.
- Server must still enforce every role — the menu is only UX.

Adding a new admin feature = (1) API route with the right `requireXxx()`, (2) `AdminFooView.vue`, (3) one entry in `adminMenuSections`, (4) one `v-else-if` branch (or a `Record<label, Component>` map — cleaner for a new project), (5) log mutations to `activity_logs`.

## Panel anatomy

```html
<div>
  <h3 class="text-xl font-semibold">Settings</h3>
  <p class="mt-1 text-sm text-content-muted">Site-wide configuration used across the app.</p>
  <p v-if="loading" class="mt-6 text-sm text-content-muted">Loading settings…</p>
  <div v-else class="mt-6 …">…</div>
</div>
```

## Settings panel (`AdminSettingsView.vue`) — form card

Backed by the key/value `settings` table ([platform-services.md](./platform-services.md#settings-store-no-migration-config)). Explicit **Save** button (not autosave), inline error/success.

```html
<div class="mt-6 max-w-md space-y-4 rounded-2xl border border-theme-border bg-surface p-5">
  <div>
    <label class="mb-1 block text-sm font-medium text-content" for="site-name">Site Name</label>
    <BaseInput id="site-name" v-model="siteName" type="text" placeholder="My App" />
    <p class="mt-1 text-xs text-content-muted">Shown in the navbar, browser tab title, sign-in screen, and outgoing emails.</p>
  </div>
  <!-- more fields -->
  <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
  <p v-if="saved" class="rounded-xl bg-success-subtle p-3 text-sm text-success">Settings saved.</p>
  <button class="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60" :disabled="saving" @click="save">
    <Save class="h-4 w-4" /> {{ saving ? 'Saving…' : 'Save settings' }}
  </button>
</div>
```

### Settings table variant (for many settings)

Same visual language, rows collapse to stacked on mobile:

```html
<div class="overflow-hidden rounded-3xl border border-theme-border bg-surface">
  <div class="divide-y divide-theme-border">
    <div v-for="s in settings" :key="s.key"
         class="grid gap-3 px-5 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
      <div>
        <p class="text-sm font-medium text-content">{{ s.label }}</p>
        <p class="text-xs text-content-muted">{{ s.help }}</p>
      </div>
      <BaseInput v-if="s.type !== 'boolean'" v-model="draft[s.key]" :type="s.type" />
      <FilterChip v-else v-model="draft[s.key]">{{ draft[s.key] ? 'On' : 'Off' }}</FilterChip>
    </div>
  </div>
</div>
```

Drive it from a typed schema array `{ key, label, help, type, public }` shared with the server whitelist.

## Data table (reports, transactions)

Use a real `<table>` only for wide numeric/tabular data; wrap for horizontal scroll:

```html
<div class="overflow-x-auto rounded-3xl border border-theme-border bg-surface shadow-sm">
  <table class="w-full text-left text-sm">
    <thead class="border-b border-theme-border text-xs font-medium uppercase tracking-wide text-content-muted">
      <tr><th class="px-4 py-3">Date</th>…</tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" class="border-b border-theme-border last:border-0">
        <td class="px-4 py-3">…</td>
      </tr>
    </tbody>
  </table>
</div>
```

Above it: filter row (`flex flex-col gap-3 sm:flex-row` with date inputs/select) + "Export CSV" secondary button. Money stored as integer cents, formatted on display.

## Record lists (users, permissions, login accounts)

Prefer stacked rows/cards over tables — they work on mobile.

**Permissions** (`AdminAccessControlView.vue`): search box with absolute dropdown results → selected users rendered as

```html
<div class="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-theme-border bg-surface p-5 shadow-sm">
  <div class="min-w-48">
    <p class="font-medium text-content">{{ user.displayName }}</p>
    <p class="text-xs text-content-muted">{{ user.email }}</p>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <FilterChip v-model="user.isAdmin">Admin</FilterChip> … <!-- autosave on change -->
    <button class="rounded-full p-2 text-danger hover:bg-danger-subtle" aria-label="Remove access"><ShieldOff class="h-4 w-4" /></button>
  </div>
</div>
```

followed by an **Activity Log** list for that category. Owner chip disabled (`pointer-events-none opacity-50`) unless current user is owner.

**Login accounts**: per-account row with status (active/suspended), last login, session count, expandable per-device sessions (UA, IP, last seen), actions: suspend/reinstate, force logout (revoke all sessions), send sign-in link — each behind a `confirm()` that states the consequence. Explicit action buttons; never make the whole row clickable.

## Log viewer (`AdminLogsView.vue`)

Search `BaseInput` (debounced 250 ms) + category `<select class="rounded-xl border border-theme-border bg-surface px-4 py-3 text-sm …">` in `flex flex-col gap-3 sm:flex-row`; results in the standard divided list; category badge `rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent`; timestamp `text-xs text-content-muted`.

## Status dashboard (`AdminStatusView.vue`)

Single `overflow-hidden rounded-3xl border border-theme-border bg-surface shadow-sm` card of metric rows: icon tile `flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent` + label `text-sm font-medium text-content sm:text-base` + value `font-semibold tabular-nums`; headline numbers `text-2xl font-semibold tabular-nums`. Includes active-user windows (24h/7d/30d/90d, cumulative). Destructive/confirm actions use `confirm()` with an explicit consequence sentence.

## Content editors (reusable for any CMS-ish app)

- **Pages** (`AdminPagesView` → `AdminPageEditView`): CodeMirror 6 markdown editor + `EditorToolbar` (bold, italic, underline, heading cycle, code, link, image, table, bullets, checklist cycle; commands centralized in `markdownCommands.ts`) + live `MarkdownPreview` overlay + `AttachmentsPanel` (drag-drop and paste-to-upload to R2, copy relative markdown link). Flags: draft/published, public/members, show on home.
- **Navigation** (`AdminMenusView` + `MenuTreeEditor`, `AddItemMenu`, `MenuItemDialog`, `PagePickerPanel`): nested folders of pages/links with drag reorder (auto-saves order), one "Add item" entry point per row (new page / existing page / link / submenu), edit in a dialog. **No delete buttons in reorder mode.** Front-end renders menus as `NavCardGrid` cards.
- **Documents / Photos**: Drive-style folder browser (folders → files; gallery folders → events → photos), in-app PDF viewer, shareable markdown links via `DocumentLinkModal`.
