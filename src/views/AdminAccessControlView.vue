<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ShieldOff } from 'lucide-vue-next';
import BaseInput from '../components/ui/BaseInput.vue';
import FilterChip from '../components/ui/FilterChip.vue';

interface AccessUser {
  id: number;
  email: string;
  displayName: string;
  isOwner: boolean | null;
  isAdmin: boolean | null;
  isEditor: boolean | null;
}

type SearchResult = AccessUser & { userId: number };

interface LogEntry {
  id: number;
  category: string;
  action: string;
  details: string | null;
  createdAt: string;
  actorEmail: string | null;
  targetEmail: string | null;
}

type PermissionField = 'isOwner' | 'isAdmin' | 'isEditor';

const emit = defineEmits<{ exit: [] }>();

const currentUserIsOwner = ref(false);
const searchQuery = ref('');
const searchResults = ref<SearchResult[]>([]);
const users = ref<AccessUser[]>([]);
const logQuery = ref('');
const logs = ref<LogEntry[]>([]);
const error = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadCurrentUser() {
  const response = await fetch('/api/auth/me');
  if (!response.ok) return;
  const data = await response.json() as { user?: { isOwner?: boolean } };
  currentUserIsOwner.value = Boolean(data.user?.isOwner);
}

async function loadUsersWithAccess() {
  const response = await fetch('/api/admin/users/with-access');
  if (!response.ok) throw new Error('Unable to load users.');
  users.value = await response.json() as AccessUser[];
}

async function loadLogs() {
  const params = new URLSearchParams({ category: 'access_control' });
  if (logQuery.value.trim()) params.set('q', logQuery.value.trim());
  const response = await fetch(`/api/admin/log-viewer/logs?${params.toString()}`);
  if (!response.ok) return;
  logs.value = await response.json() as LogEntry[];
}

watch(searchQuery, (value) => {
  clearTimeout(searchTimer);
  if (!value.trim()) {
    searchResults.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(value.trim())}`);
    if (response.ok) searchResults.value = await response.json() as SearchResult[];
  }, 250);
});

function addToList(user: AccessUser) {
  if (users.value.some((existing) => existing.id === user.id)) return;
  users.value.unshift({
    id: user.id,
    email: user.email,
    displayName: user.displayName || user.email,
    isOwner: user.isOwner ?? false,
    isAdmin: user.isAdmin ?? false,
    isEditor: user.isEditor ?? false,
  });
}

function selectUser(result: SearchResult) {
  error.value = '';
  searchQuery.value = '';
  searchResults.value = [];
  addToList(result);
}

// No account exists for this email yet, so create one before granting a role.
async function addByEmail() {
  error.value = '';
  const response = await fetch('/api/admin/access-control/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: searchQuery.value.trim() }),
  });
  const data = await response.json() as { error?: string; user?: AccessUser };
  if (!response.ok || !data.user) {
    error.value = data.error ?? 'Unable to add user.';
    return;
  }
  searchQuery.value = '';
  searchResults.value = [];
  addToList(data.user);
}

async function togglePermission(user: AccessUser, field: PermissionField) {
  error.value = '';
  const nextValue = !user[field];
  const previousValue = user[field];
  user[field] = nextValue; // optimistic
  if (field === 'isOwner' && nextValue) user.isAdmin = true;

  const response = await fetch(`/api/admin/users/${user.id}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, value: nextValue }),
  });
  const data = await response.json() as { error?: string; user?: AccessUser };
  if (!response.ok) {
    user[field] = previousValue; // rollback
    error.value = data.error ?? 'Unable to update permission.';
    return;
  }
  Object.assign(user, data.user);
  loadLogs();
}

async function clearPermissions(user: AccessUser) {
  if (!confirm(`Revoke all access for ${user.displayName}? This removes Owner, Admin, and Editor permissions.`)) return;
  error.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/permissions/clear`, { method: 'POST' });
  const data = await response.json() as { error?: string };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to clear permissions.';
    return;
  }
  users.value = users.value.filter((existing) => existing.id !== user.id);
  loadLogs();
}

function formatDetails(entry: LogEntry): string {
  if (!entry.details) return entry.action;
  try {
    const parsed = JSON.parse(entry.details);
    if (entry.action === 'set_permission') return `${parsed.field}: ${parsed.from ? 'on' : 'off'} → ${parsed.to ? 'on' : 'off'}`;
    if (entry.action === 'clear_permissions') return 'cleared all permissions';
    return entry.action;
  } catch {
    return entry.action;
  }
}

const noResults = computed(() => searchQuery.value.trim().length > 0 && searchResults.value.length === 0);
const canAddByEmail = computed(() => noResults.value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchQuery.value.trim()));

onMounted(() => {
  loadCurrentUser();
  loadUsersWithAccess().catch((loadError) => { error.value = loadError instanceof Error ? loadError.message : 'Unable to load users.'; });
  loadLogs();
});
</script>

<template>
  <section class="space-y-8">
    <button
      type="button"
      class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
      @click="emit('exit')"
    >
      ← Admin menu
    </button>

    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Permissions</h2>
      <p class="mt-2 text-content-muted">Search for a user to grant or revoke Editor, Admin, and Owner access. Type a full email address to add someone who has not signed in yet.</p>
    </div>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>

    <div class="relative">
      <BaseInput v-model="searchQuery" placeholder="Search users by name or email..." />
      <div v-if="searchResults.length" class="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-theme-border bg-surface shadow-lg">
        <button
          v-for="result in searchResults"
          :key="result.userId"
          type="button"
          class="block w-full px-4 py-3 text-left text-sm hover:bg-app-bg"
          @click="selectUser(result)"
        >
          <span class="font-medium text-content">{{ result.displayName }}</span>
          <span class="ml-2 text-content-muted">{{ result.email }}</span>
        </button>
      </div>
      <button
        v-else-if="canAddByEmail"
        type="button"
        class="absolute z-10 mt-2 block w-full rounded-2xl border border-theme-border bg-surface p-3 text-left text-sm shadow-lg hover:bg-app-bg"
        @click="addByEmail"
      >
        Add <span class="font-medium text-content">{{ searchQuery.trim() }}</span>
        <span class="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">New account</span>
      </button>
      <p v-else-if="noResults" class="absolute z-10 mt-2 w-full rounded-2xl border border-theme-border bg-surface p-3 text-sm text-content-muted shadow-lg">
        No matching users.
      </p>
    </div>

    <div class="space-y-3">
      <p v-if="!users.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No users with access yet. Search above to add one.</p>
      <div v-for="user in users" :key="user.id" class="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-theme-border bg-surface p-5 shadow-sm">
        <div class="min-w-48">
          <p class="font-medium text-content">{{ user.displayName }}</p>
          <p class="text-xs text-content-muted">{{ user.email }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <FilterChip :model-value="Boolean(user.isEditor)" @update:model-value="togglePermission(user, 'isEditor')">Editor</FilterChip>
          <FilterChip :model-value="Boolean(user.isAdmin)" @update:model-value="togglePermission(user, 'isAdmin')">Admin</FilterChip>
          <FilterChip
            :model-value="Boolean(user.isOwner)"
            :class="{ 'pointer-events-none opacity-50': !currentUserIsOwner }"
            @update:model-value="currentUserIsOwner && togglePermission(user, 'isOwner')"
          >
            Owner
          </FilterChip>
          <button
            type="button"
            class="rounded-full p-2 text-danger hover:bg-danger-subtle"
            aria-label="Revoke all access for this user"
            title="Revoke all access for this user"
            @click="clearPermissions(user)"
          >
            <ShieldOff class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <div class="flex items-center justify-between gap-4">
        <h3 class="text-lg font-semibold">Activity Log</h3>
      </div>
      <BaseInput v-model="logQuery" placeholder="Search activity log..." @update:model-value="loadLogs" />
      <p v-if="!logs.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No access control activity yet.</p>
      <ul v-else class="divide-y divide-theme-border rounded-3xl border border-theme-border bg-surface">
        <li v-for="entry in logs" :key="entry.id" class="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
          <span>
            <span class="font-medium text-content">{{ entry.actorEmail ?? 'Unknown' }}</span>
            <span class="text-content-muted"> updated </span>
            <span class="font-medium text-content">{{ entry.targetEmail ?? 'Unknown' }}</span>
            <span class="text-content-muted"> — {{ formatDetails(entry) }}</span>
          </span>
          <span class="text-xs text-content-muted">{{ new Date(entry.createdAt).toLocaleString() }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
