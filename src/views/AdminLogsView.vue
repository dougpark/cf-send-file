<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import BaseInput from '../components/ui/BaseInput.vue';

interface LogEntry {
  id: number;
  category: string;
  action: string;
  details: string | null;
  createdAt: string;
  actorEmail: string | null;
  targetEmail: string | null;
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'access_control', label: 'Access Control' },
  { value: 'access_request', label: 'Access Request' },
  { value: 'user_management', label: 'User Management' },
  { value: 'settings', label: 'Settings' },
];

const searchQuery = ref('');
const categoryFilter = ref('');
const logs = ref<LogEntry[]>([]);
const isLoading = ref(false);
const error = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadLogs() {
  isLoading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams();
    if (searchQuery.value.trim()) params.set('q', searchQuery.value.trim());
    if (categoryFilter.value) params.set('category', categoryFilter.value);
    const response = await fetch(`/api/admin/log-viewer/logs?${params.toString()}`);
    if (!response.ok) throw new Error('Unable to load logs.');
    logs.value = await response.json() as LogEntry[];
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load logs.';
  } finally {
    isLoading.value = false;
  }
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

watch(searchQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadLogs, 250);
});

watch(categoryFilter, loadLogs);

onMounted(loadLogs);
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Logs</h2>
      <p class="mt-2 text-content-muted">Search the activity log across the site, filtered by category and sorted by most recent.</p>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row">
      <div class="flex-1">
        <BaseInput v-model="searchQuery" placeholder="Search logs by action or user email..." />
      </div>
      <select
        v-model="categoryFilter"
        class="rounded-xl border border-theme-border bg-surface px-4 py-3 text-sm text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        <option v-for="option in CATEGORY_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </div>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>

    <p v-if="!isLoading && !logs.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No log entries match your search.</p>
    <ul v-else class="divide-y divide-theme-border rounded-3xl border border-theme-border bg-surface">
      <li v-for="entry in logs" :key="entry.id" class="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
        <span>
          <span class="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{{ entry.category }}</span>
          <span class="ml-2 font-medium text-content">{{ entry.actorEmail ?? 'Unknown' }}</span>
          <span v-if="entry.targetEmail" class="text-content-muted"> → {{ entry.targetEmail }}</span>
          <span class="text-content-muted"> — {{ formatDetails(entry) }}</span>
        </span>
        <span class="text-xs text-content-muted">{{ new Date(entry.createdAt).toLocaleString() }}</span>
      </li>
    </ul>
  </section>
</template>
