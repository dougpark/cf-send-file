<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Save } from 'lucide-vue-next';
import BaseInput from '../components/ui/BaseInput.vue';
import { useSiteSettings } from '../composables/useSiteSettings';

const { siteName: sharedSiteName } = useSiteSettings();
const adminEmail = ref('');
const siteName = ref('');
const openSignup = ref(false);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const saved = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/admin/settings');
    if (!response.ok) throw new Error('Unable to load settings.');
    const data = await response.json() as { adminEmail: string; siteName: string; openSignup: boolean };
    adminEmail.value = data.adminEmail;
    siteName.value = data.siteName;
    openSignup.value = data.openSignup;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load settings.';
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = '';
  saved.value = false;
  try {
    const response = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail: adminEmail.value, siteName: siteName.value, openSignup: openSignup.value }),
    });
    const data = await response.json() as { error?: string; adminEmail: string; siteName: string; openSignup: boolean };
    if (!response.ok) throw new Error(data.error ?? 'Unable to save settings.');
    adminEmail.value = data.adminEmail;
    siteName.value = data.siteName;
    openSignup.value = data.openSignup;
    sharedSiteName.value = data.siteName;
    saved.value = true;
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : 'Unable to save settings.';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <h3 class="text-xl font-semibold">Settings</h3>
    <p class="mt-1 text-sm text-content-muted">Site-wide configuration used across the app.</p>

    <p v-if="loading" class="mt-6 text-sm text-content-muted">Loading settings…</p>

    <div v-else class="mt-6 max-w-md space-y-4 rounded-2xl border border-theme-border bg-surface p-5">
      <div>
        <label class="mb-1 block text-sm font-medium text-content" for="site-name">Site Name</label>
        <BaseInput id="site-name" v-model="siteName" type="text" placeholder="My App" />
        <p class="mt-1 text-xs text-content-muted">Shown in the navbar, browser tab title, sign-in screen, and outgoing emails.</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-content" for="admin-email">Admin Email</label>
        <BaseInput id="admin-email" v-model="adminEmail" type="email" placeholder="admin@example.com" />
        <p class="mt-1 text-xs text-content-muted">Used as the reply-to contact address on sign-in and access request emails.</p>
      </div>

      <label class="flex items-start gap-3" for="open-signup">
        <input id="open-signup" v-model="openSignup" type="checkbox" class="mt-1 h-4 w-4 accent-accent" />
        <span>
          <span class="block text-sm font-medium text-content">Open sign-up</span>
          <span class="mt-1 block text-xs text-content-muted">When on, anyone who signs in with a new email becomes a member automatically. When off, new people must submit an access request for an admin to approve.</span>
        </span>
      </label>

      <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
      <p v-if="saved" class="rounded-xl bg-success-subtle p-3 text-sm text-success">Settings saved.</p>

      <button
        type="button"
        class="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
        :disabled="saving"
        @click="save"
      >
        <Save class="h-4 w-4" />
        {{ saving ? 'Saving…' : 'Save settings' }}
      </button>
    </div>
  </div>
</template>
