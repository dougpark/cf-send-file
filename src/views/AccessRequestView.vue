<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { signOutAndClearBrowserData } from '../lib/session';

const fullName = ref('');
const message = ref('');
const isSubmitting = ref(false);
const submitted = ref(false);
const error = ref('');

onMounted(async () => {
  const response = await fetch('/api/auth/me');
  if (!response.ok) return;
  const data = await response.json() as { accessRequestPending?: boolean };
  if (data.accessRequestPending) submitted.value = true;
});

async function switchAccount() {
  await signOutAndClearBrowserData();
}

async function submitRequest() {
  isSubmitting.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/access-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: fullName.value, message: message.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to submit your request.');
    submitted.value = true;
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to submit your request.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-md py-10 sm:py-16">
    <div class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm sm:p-8">
      <template v-if="!submitted">
        <h2 class="text-2xl font-semibold tracking-tight">Request access</h2>
        <p class="mt-2 text-content-muted">This site is for members only. Tell us who you are and an administrator will review your request.</p>
        <form class="mt-8 space-y-4" @submit.prevent="submitRequest">
          <label class="block text-sm font-medium">
            Full name
            <input v-model="fullName" required class="mt-2 w-full rounded-xl border border-theme-border px-4 py-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" autocomplete="name" />
          </label>
          <label class="block text-sm font-medium">
            Message <span class="font-normal text-content-muted">(optional)</span>
            <textarea v-model="message" rows="3" maxlength="1000" class="mt-2 w-full rounded-xl border border-theme-border px-4 py-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="How do you know us, or why do you need access?" />
          </label>
          <div class="flex flex-col gap-3 sm:flex-row-reverse">
            <button type="submit" :disabled="isSubmitting" class="flex-1 rounded-full bg-accent px-6 py-3 font-medium text-on-accent hover:opacity-90 disabled:opacity-60">
              {{ isSubmitting ? 'Submitting...' : 'Submit for review' }}
            </button>
            <button type="button" :disabled="isSubmitting" class="flex-1 rounded-full border border-accent px-6 py-3 font-medium text-accent hover:bg-accent/10 disabled:opacity-60" @click="switchAccount">
              Use a different email
            </button>
          </div>
        </form>
        <p v-if="error" class="mt-5 rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
      </template>
      <template v-else>
        <h2 class="text-2xl font-semibold tracking-tight">Request submitted</h2>
        <p class="mt-3 text-content-muted">Your account is being reviewed. An administrator will review it, and you'll get an email when it's approved.</p>
        <button type="button" class="mt-6 rounded-full border border-accent px-6 py-3 font-medium text-accent hover:bg-accent/10" @click="switchAccount">Use a different email</button>
      </template>
    </div>
  </section>
</template>
