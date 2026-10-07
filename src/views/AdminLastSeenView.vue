<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import BaseInput from '../components/ui/BaseInput.vue';

interface LastSeenEntry {
  userId: number;
  email: string | null;
  displayName: string | null;
  lastSeenAt: number | null;
}

const searchQuery = ref('');
const entries = ref<LastSeenEntry[]>([]);
const isLoading = ref(false);
const error = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadEntries() {
  isLoading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams();
    if (searchQuery.value.trim()) params.set('q', searchQuery.value.trim());
    const response = await fetch(`/api/admin/log-viewer/last-seen?${params.toString()}`);
    if (!response.ok) throw new Error('Unable to load last seen records.');
    entries.value = await response.json() as LastSeenEntry[];
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load last seen records.';
  } finally {
    isLoading.value = false;
  }
}

function formatLastSeen(value: number | null): string {
  if (!value) return 'Never';
  return new Date(value * 1000).toLocaleString();
}

watch(searchQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadEntries, 250);
});

onMounted(loadEntries);
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Last Seen</h2>
      <p class="mt-2 text-content-muted">Most recently active users, sorted by last seen.</p>
    </div>

    <BaseInput v-model="searchQuery" placeholder="Search by name or email..." />

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>

    <p v-if="!isLoading && !entries.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No last seen records match your search.</p>
    <ul v-else class="divide-y divide-theme-border rounded-3xl border border-theme-border bg-surface">
      <li v-for="entry in entries" :key="entry.userId" class="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
        <span>
          <span class="font-medium text-content">{{ entry.displayName ?? entry.email ?? 'Unknown user' }}</span>
          <span v-if="entry.email" class="text-content-muted"> · {{ entry.email }}</span>
        </span>
        <span class="text-xs text-content-muted">{{ formatLastSeen(entry.lastSeenAt) }}</span>
      </li>
    </ul>
  </section>
</template>
