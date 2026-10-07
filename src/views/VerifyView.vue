<script setup lang="ts">
import { ref } from 'vue';
import { ShieldCheck } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { useSiteSettings } from '../composables/useSiteSettings';

const route = useRoute();
const router = useRouter();
const { siteName, loadSiteSettings } = useSiteSettings();
const token = typeof route.query.token === 'string' ? route.query.token : '';
const isConfirming = ref(false);
const error = ref(token ? '' : 'This sign-in link is missing its token.');
const failed = ref(!token);

async function confirmLogin() {
  isConfirming.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'This sign-in link is invalid or expired.');
    await router.replace(data.matched ? '/home' : '/access-request');
  } catch (verificationError) {
    error.value = verificationError instanceof Error ? verificationError.message : 'Unable to verify sign-in link.';
    failed.value = true;
  } finally {
    isConfirming.value = false;
  }
}

loadSiteSettings();
</script>

<template>
  <section class="mx-auto max-w-md py-10 sm:py-16">
    <div class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm sm:p-8">
      <template v-if="!failed">
        <div class="mb-8">
          <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <ShieldCheck class="h-5 w-5" />
          </div>
          <h2 class="text-2xl font-semibold tracking-tight">Sign in to {{ siteName }}</h2>
          <p class="mt-2 text-content-muted">Confirm that you want to sign in on this device.</p>
        </div>
        <button
          type="button"
          :disabled="isConfirming"
          class="w-full rounded-full bg-accent px-6 py-3 font-medium text-on-accent transition-all hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          @click="confirmLogin"
        >
          {{ isConfirming ? 'Signing in...' : 'Click to Confirm Login' }}
        </button>
      </template>
      <div v-else>
        <h2 class="text-xl font-semibold">Sign-in link unavailable</h2>
        <p class="mt-2 text-content-muted">{{ error }}</p>
        <RouterLink to="/login" class="mt-6 inline-flex rounded-full bg-accent px-6 py-3 font-medium text-on-accent">Request a new link</RouterLink>
      </div>
    </div>
  </section>
</template>
