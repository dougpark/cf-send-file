<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { X } from 'lucide-vue-next';

interface AccessRequest {
  id: number;
  email: string;
  fullName: string;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  notes: string | null;
  createdAt: string;
}

const requests = ref<AccessRequest[]>([]);
const selectedId = ref<number | null>(null);
const reviewNotes = ref('');
const isLoading = ref(true);
const isReviewing = ref(false);
const error = ref('');
const notice = ref('');

const pendingRequests = computed(() => requests.value.filter((request) => request.status === 'pending'));
const sortedRequests = computed(() => [...requests.value].sort((left, right) => {
  const leftOpen = left.status === 'pending' ? 0 : 1;
  const rightOpen = right.status === 'pending' ? 0 : 1;
  if (leftOpen !== rightOpen) return leftOpen - rightOpen;
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}));
const selectedRequest = computed(() => requests.value.find((request) => request.id === selectedId.value) ?? null);

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadRequests() {
  isLoading.value = true;
  try {
    const response = await fetch('/api/admin/access-requests');
    if (!response.ok) throw new Error('Unable to load access requests.');
    requests.value = await response.json();
    if (!selectedId.value && pendingRequests.value[0]) selectedId.value = pendingRequests.value[0].id;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load access requests.';
  } finally {
    isLoading.value = false;
  }
}

function selectRequest(request: AccessRequest) {
  selectedId.value = request.id;
  reviewNotes.value = '';
}

async function review(status: 'approved' | 'rejected') {
  const request = selectedRequest.value;
  if (!request) return;
  isReviewing.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await fetch(`/api/admin/access-requests/${request.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes: reviewNotes.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to update request.');
    request.status = status;
    request.reviewedAt = new Date().toISOString();
    request.notes = reviewNotes.value.trim() || null;
    notice.value = data.emailSent === false ? data.warning : `${status === 'approved' ? 'Approval' : 'Rejection'} email sent.`;
    reviewNotes.value = '';
    const next = pendingRequests.value.find((item) => item.id !== request.id);
    selectedId.value = next?.id ?? request.id;
  } catch (reviewError) {
    error.value = reviewError instanceof Error ? reviewError.message : 'Unable to update request.';
  } finally {
    isReviewing.value = false;
  }
}

onMounted(loadRequests);
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-medium uppercase tracking-wide text-accent">Admin review</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Access Requests</h2>
        <p class="mt-2 text-content-muted">Approving a request makes the person a member and emails them a sign-in link.</p>
      </div>
      <span class="rounded-full bg-warning-subtle px-3 py-1.5 text-sm font-medium text-warning">{{ pendingRequests.length }} pending</span>
    </div>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    <p v-if="notice" class="rounded-xl bg-success-subtle p-3 text-sm text-success">{{ notice }}</p>
    <p v-if="isLoading" class="py-10 text-center text-content-muted">Loading requests...</p>
    <p v-else-if="!requests.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No access requests.</p>

    <div v-else class="grid min-h-136 overflow-hidden rounded-3xl border border-theme-border bg-surface shadow-sm lg:grid-cols-[18rem_1fr]">
      <aside class="border-b border-theme-border bg-app-bg p-3 lg:border-b-0 lg:border-r">
        <h3 class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content-muted">Requests</h3>
        <button
          v-for="request in sortedRequests"
          :key="request.id"
          type="button"
          class="mb-1 w-full rounded-2xl p-3 text-left transition-colors"
          :class="selectedId === request.id ? 'bg-surface shadow-sm' : 'hover:bg-surface/70'"
          @click="selectRequest(request)"
        >
          <span class="flex items-center justify-between gap-2">
            <strong class="truncate text-sm">{{ request.fullName }}</strong>
            <span class="h-2 w-2 shrink-0 rounded-full" :class="request.status === 'pending' ? 'bg-[#f4b400]' : request.status === 'approved' ? 'bg-[#34a853]' : 'bg-danger'" />
          </span>
          <span class="mt-1 block truncate text-xs text-content-muted">{{ request.email }}</span>
          <span class="mt-1 block text-[11px] uppercase tracking-wide text-content-muted">
            {{ request.status }}<template v-if="request.status !== 'pending' && request.reviewedAt"> · {{ formatDate(request.reviewedAt) }}</template>
          </span>
        </button>
      </aside>

      <article v-if="selectedRequest" class="p-5 sm:p-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 class="text-xl font-semibold">{{ selectedRequest.fullName }}</h3>
            <p class="mt-1 text-sm text-content-muted">{{ selectedRequest.email }}</p>
            <p class="text-sm text-content-muted">Submitted {{ formatDate(selectedRequest.createdAt) }}</p>
          </div>
          <span class="rounded-full px-3 py-1 text-xs font-medium" :class="selectedRequest.status === 'pending' ? 'bg-warning-subtle text-warning' : selectedRequest.status === 'approved' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'">
            {{ selectedRequest.status }}<template v-if="selectedRequest.status !== 'pending' && selectedRequest.reviewedAt"> · {{ formatDate(selectedRequest.reviewedAt) }}</template>
          </span>
        </div>

        <div v-if="selectedRequest.message" class="mt-8 border-t border-theme-border pt-6">
          <h4 class="font-semibold">Message</h4>
          <p class="mt-2 whitespace-pre-line text-sm text-content-muted">{{ selectedRequest.message }}</p>
        </div>

        <div v-if="selectedRequest.notes" class="mt-8 border-t border-theme-border pt-6">
          <h4 class="font-semibold">Review notes</h4>
          <p class="mt-2 whitespace-pre-line text-sm text-content-muted">{{ selectedRequest.notes }}</p>
        </div>

        <div v-if="selectedRequest.status === 'pending'" class="mt-8 border-t border-theme-border pt-6">
          <label for="review-notes" class="font-semibold">Review notes <span class="text-sm font-normal text-content-muted">(optional, internal)</span></label>
          <textarea id="review-notes" v-model="reviewNotes" rows="3" maxlength="1000" class="mt-2 w-full rounded-xl border border-theme-border bg-surface p-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
        </div>

        <div v-if="selectedRequest.status === 'pending'" class="mt-8 flex flex-wrap gap-3 border-t border-theme-border pt-6">
          <button type="button" :disabled="isReviewing" class="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60" @click="review('approved')">Approve and send login link</button>
          <button type="button" :disabled="isReviewing" class="inline-flex items-center gap-2 rounded-full border border-danger px-5 py-2.5 text-sm font-medium text-danger hover:bg-danger-subtle disabled:opacity-60" @click="review('rejected')"><X class="h-4 w-4" /> Reject request</button>
        </div>
      </article>
      <div v-else class="flex items-center justify-center p-8 text-center text-content-muted">Select a request to review.</div>
    </div>
  </section>
</template>
