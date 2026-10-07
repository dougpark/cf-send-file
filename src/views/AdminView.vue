<script setup lang="ts">
import { computed, onMounted, ref, watch, type Component } from 'vue';
import { ChevronDown, ClipboardList, Clock, Gauge, ScrollText, Settings, ShieldCheck, Users } from 'lucide-vue-next';
import AdminAccessControlView from './AdminAccessControlView.vue';
import AdminAccessRequestsView from './AdminAccessRequestsView.vue';
import AdminLastSeenView from './AdminLastSeenView.vue';
import AdminLoginUsersView from './AdminLoginUsersView.vue';
import AdminLogsView from './AdminLogsView.vue';
import AdminSettingsView from './AdminSettingsView.vue';
import AdminStatusView from './AdminStatusView.vue';

// 'staff' = any admin-area role (Owner, Admin, Editor). Add roles here as your app grows.
type Role = 'staff' | 'admin' | 'editor';

interface AdminFeature {
  label: string;
  description: string;
  icon: Component;
  role: Role;
  component: Component;
  // Takes the whole panel (hides the sidebar), for wide editors/tables.
  fullWidth?: boolean;
}

interface AdminMenuSection {
  label: string;
  description: string;
  icon: Component;
  role: Role;
  disabled?: boolean;
  feature?: AdminFeature;
  children?: AdminFeature[];
}

const ACCORDION_STORAGE_KEY = 'app.admin.expandedSection';

const selectedFeature = ref('Status');
const expandedSection = ref<string | null>(null);
const permissions = ref({ isOwner: false, isAdmin: false, isEditor: false });

// To add an admin feature: create src/views/AdminXxxView.vue and add an entry here.
const adminMenuSections: AdminMenuSection[] = [
  {
    label: 'Status',
    description: 'Accounts, requests, and active users.',
    icon: Gauge,
    role: 'staff',
    feature: { label: 'Status', description: 'Accounts, requests, and active users.', icon: Gauge, role: 'staff', component: AdminStatusView },
  },
  {
    label: 'User Management',
    description: 'Review requests, accounts, and permissions.',
    icon: ShieldCheck,
    role: 'admin',
    children: [
      { label: 'Access Requests', description: 'Approve or reject membership requests.', icon: ClipboardList, role: 'admin', component: AdminAccessRequestsView },
      { label: 'Login Accounts', description: 'Membership, suspension, sessions, and sign-in links.', icon: Users, role: 'admin', component: AdminLoginUsersView },
      { label: 'Permissions', description: 'Grant and revoke Owner, Admin, and Editor roles.', icon: ShieldCheck, role: 'admin', component: AdminAccessControlView, fullWidth: true },
    ],
  },
  {
    label: 'Log Viewer',
    description: 'Browse activity logs and recent users.',
    icon: ScrollText,
    role: 'staff',
    children: [
      { label: 'Logs', description: 'Search and filter the activity log.', icon: ScrollText, role: 'staff', component: AdminLogsView },
      { label: 'Last Seen', description: 'Most recently active users.', icon: Clock, role: 'staff', component: AdminLastSeenView },
    ],
  },
  {
    label: 'Settings',
    description: 'Configure site-wide settings.',
    icon: Settings,
    role: 'admin',
    feature: { label: 'Settings', description: 'Configure site-wide settings.', icon: Settings, role: 'admin', component: AdminSettingsView },
  },
];

const isAdmin = computed(() => permissions.value.isAdmin || permissions.value.isOwner);

function allows(role: Role) {
  if (role === 'admin') return isAdmin.value;
  if (role === 'editor') return isAdmin.value || permissions.value.isEditor;
  return true;
}

const menuSections = computed(() => adminMenuSections
  .map((section) => section.children?.length
    ? { ...section, children: section.children.filter((child) => allows(child.role)) }
    : section)
  .filter((section) => section.disabled || (section.children ? section.children.length > 0 : allows(section.role))));

const features = computed(() => menuSections.value.flatMap((section) => {
  if (section.children?.length) return section.children;
  return section.feature && !section.disabled ? [section.feature] : [];
}));

const selectedSection = computed(() => menuSections.value.find((section) => {
  if (section.feature?.label === selectedFeature.value) return true;
  return section.children?.some((child) => child.label === selectedFeature.value) ?? false;
}));

const selectedFeatureDef = computed(() => features.value.find((feature) => feature.label === selectedFeature.value) ?? null);
const selectedComponent = computed(() => selectedFeatureDef.value?.component ?? null);
const fullWidthAdminFeature = computed(() => Boolean(selectedFeatureDef.value?.fullWidth));

onMounted(async () => {
  const savedExpandedSection = localStorage.getItem(ACCORDION_STORAGE_KEY);
  if (savedExpandedSection && adminMenuSections.some((section) => section.label === savedExpandedSection && section.children?.length)) {
    expandedSection.value = savedExpandedSection;
  }

  const response = await fetch('/api/auth/me');
  if (!response.ok) return;
  const data = await response.json() as { user?: Partial<typeof permissions.value> };
  permissions.value = {
    isOwner: Boolean(data.user?.isOwner),
    isAdmin: Boolean(data.user?.isAdmin),
    isEditor: Boolean(data.user?.isEditor),
  };
});

// Falls back to the first permitted tab so a revoked permission cannot leave a stale pane open.
watch(features, (list) => {
  if (!list.some((feature) => feature.label === selectedFeature.value)) {
    selectedFeature.value = list[0]?.label ?? 'Status';
  }
});

watch(menuSections, (sections) => {
  if (expandedSection.value && !sections.some((section) => section.label === expandedSection.value && section.children?.length)) {
    expandedSection.value = null;
    localStorage.removeItem(ACCORDION_STORAGE_KEY);
  }
});

function selectFeature(label: string) {
  if (!features.value.some((feature) => feature.label === label)) return;
  selectedFeature.value = label;
}

function saveExpandedSection(label: string | null) {
  expandedSection.value = label;
  if (label) localStorage.setItem(ACCORDION_STORAGE_KEY, label);
  else localStorage.removeItem(ACCORDION_STORAGE_KEY);
}

function toggleSection(section: AdminMenuSection) {
  if (section.disabled) return;
  if (section.children?.length) {
    saveExpandedSection(expandedSection.value === section.label ? null : section.label);
    return;
  }
  if (section.feature) selectFeature(section.feature.label);
}

function selectChild(section: AdminMenuSection, child: AdminFeature) {
  saveExpandedSection(section.label);
  selectFeature(child.label);
}

function isSectionActive(section: AdminMenuSection) {
  if (section.feature?.label === selectedFeature.value) return true;
  return section.children?.some((child) => child.label === selectedFeature.value) ?? false;
}
</script>

<template>
  <section class="space-y-6">
    <nav class="flex items-center gap-2 text-sm text-content-muted" aria-label="Breadcrumb">
      <button type="button" class="hover:text-accent" @click="selectFeature('Status')">Admin</button>
      <template v-if="selectedSection?.children?.length">
        <span aria-hidden="true">/</span>
        <span>{{ selectedSection.label }}</span>
      </template>
      <span aria-hidden="true">/</span>
      <span class="font-medium text-content" aria-current="page">{{ selectedFeature }}</span>
    </nav>

    <div>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Administration</h2>
    </div>

    <div
      class="grid min-h-112 rounded-3xl border border-theme-border bg-surface shadow-sm"
      :class="fullWidthAdminFeature ? 'md:grid-cols-1' : 'overflow-hidden md:grid-cols-[17rem_minmax(0,1fr)]'"
    >
      <nav
        v-if="!fullWidthAdminFeature"
        class="border-b border-theme-border bg-app-bg p-3 md:border-b-0 md:border-r"
        aria-label="Admin features"
      >
        <div class="space-y-1">
          <div v-for="section in menuSections" :key="section.label">
            <button
              type="button"
              class="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors"
              :class="[
                section.disabled
                  ? 'cursor-not-allowed text-content-muted/60'
                  : isSectionActive(section)
                    ? 'bg-surface text-accent shadow-sm'
                    : 'text-content-muted hover:bg-surface/70',
              ]"
              :aria-expanded="section.children?.length ? expandedSection === section.label : undefined"
              :aria-controls="section.children?.length ? `admin-section-${section.label.replaceAll(' ', '-')}` : undefined"
              :disabled="section.disabled"
              @click="toggleSection(section)"
            >
              <component :is="section.icon" class="mt-0.5 h-5 w-5 shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ section.label }}</span>
                <span class="mt-0.5 block text-xs text-content-muted">{{ section.description }}</span>
              </span>
              <ChevronDown
                v-if="section.children?.length"
                class="mt-1 h-4 w-4 shrink-0 transition-transform"
                :class="expandedSection === section.label ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </button>

            <div
              v-if="section.children?.length && expandedSection === section.label"
              :id="`admin-section-${section.label.replaceAll(' ', '-')}`"
              class="mt-1 space-y-1 pb-1 pl-8"
            >
              <button
                v-for="child in section.children"
                :key="child.label"
                type="button"
                class="block w-full truncate rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors"
                :class="selectedFeature === child.label ? 'bg-accent text-on-accent shadow-sm' : 'text-content-muted hover:bg-surface/70 hover:text-content'"
                @click="selectChild(section, child)"
              >
                {{ child.label }}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div class="min-w-0 p-6 sm:p-8">
        <component :is="selectedComponent" v-if="selectedComponent" @exit="selectFeature('Status')" />
      </div>
    </div>
  </section>
</template>
