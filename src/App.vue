<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Check, ChevronDown, Clock, Home, Info, LifeBuoy, LogIn, LogOut, Palette, Plus, Save, ShieldCheck, Trash2, UserRound, X } from 'lucide-vue-next';
import { useRoute } from 'vue-router';
import { useTheme } from './composables/useTheme';
import { signOutAndClearBrowserData } from './lib/session';
import { useSiteSettings } from './composables/useSiteSettings';
import { useEnvironmentBanner } from './composables/useEnvironmentBanner';
import AboutModal from './components/common/AboutModal.vue';
import EnvironmentBanner from './components/layout/EnvironmentBanner.vue';
import HelpChatWidget from './components/layout/HelpChatWidget.vue';
import logoSvg from '/logo.svg?raw';

interface AuthUser {
  displayName: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  isEditor?: boolean;
  lastActiveAt?: string | null;
  matched?: boolean;
}

const user = ref<AuthUser | null>(null);
const route = useRoute();
const navbarLogo = logoSvg;
const { theme, themeOptions, applyTheme } = useTheme();
const { siteName, loadSiteSettings } = useSiteSettings();
const envInfo = useEnvironmentBanner();
const isAccountMenuOpen = ref(false);
const isAccountPanelOpen = ref(false);
const isAboutModalOpen = ref(false);
const profileName = ref('');
const loginEmails = ref<string[]>([]);
const isLoadingEmails = ref(false);
const isSavingEmails = ref(false);
const emailPanelError = ref('');
const emailPanelSaved = ref(false);

const showLastActiveBanner = ref(false);
const lastActiveText = ref('');
let bannerTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

function openAboutPanel() {
  isAccountMenuOpen.value = false;
  isAboutModalOpen.value = true;
}

function canAdmin(authUser: AuthUser | null): boolean {
  return Boolean(authUser?.isOwner || authUser?.isAdmin || authUser?.isEditor);
}

const primaryNavItems = [
  { key: 'home', label: 'Home', to: '/home', icon: Home, match: (path: string) => path.startsWith('/home') },
  { key: 'help', label: 'Help', to: '/help', icon: LifeBuoy, match: (path: string) => path.startsWith('/help') },
  { key: 'admin', label: 'Admin', to: '/admin', icon: ShieldCheck, match: (path: string) => path.startsWith('/admin'), adminOnly: true },
];

const visibleNavItems = computed(() => primaryNavItems.filter((item) => !item.adminOnly || canAdmin(user.value)));
const desktopNavItems = computed(() => visibleNavItems.value.filter((item) => item.key !== 'home'));

function dismissLastActiveBanner() {
  showLastActiveBanner.value = false;
  try {
    sessionStorage.setItem('last_active_banner_dismissed', 'true');
  } catch {
    // Ignore storage errors in restricted contexts
  }
  if (bannerTimeoutTimer) {
    clearTimeout(bannerTimeoutTimer);
    bannerTimeoutTimer = null;
  }
}

function formatLastActive(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeString = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `today at ${timeString}`;
  }
  if (isYesterday) {
    return `yesterday at ${timeString}`;
  }

  const dateFormatted = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${dateFormatted} at ${timeString}`;
}

async function openAccountPanel() {
  isAccountMenuOpen.value = false;
  isAccountPanelOpen.value = true;
  isLoadingEmails.value = true;
  emailPanelError.value = '';
  emailPanelSaved.value = false;
  profileName.value = user.value?.displayName ?? '';
  try {
    const response = await fetch('/api/account/login-emails');
    const data = await response.json() as { error?: string; emails: string[] };
    if (!response.ok) throw new Error(data.error ?? 'Unable to load Login Emails.');
    loginEmails.value = data.emails;
  } catch (error) {
    emailPanelError.value = error instanceof Error ? error.message : 'Unable to load Login Emails.';
  } finally {
    isLoadingEmails.value = false;
  }
}

function toggleAccountMenu() {
  isAccountMenuOpen.value = !isAccountMenuOpen.value;
}

function addLoginEmail() {
  loginEmails.value.push('');
}

async function saveAccount() {
  isSavingEmails.value = true;
  emailPanelError.value = '';
  emailPanelSaved.value = false;
  try {
    const profileResponse = await fetch('/api/account/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: profileName.value }),
    });
    const profile = await profileResponse.json() as { error?: string; displayName: string };
    if (!profileResponse.ok) throw new Error(profile.error ?? 'Unable to save your name.');
    if (user.value && profile.displayName) user.value.displayName = profile.displayName;

    const response = await fetch('/api/account/login-emails', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: loginEmails.value }),
    });
    const data = await response.json() as { error?: string; emails: string[] };
    if (!response.ok) throw new Error(data.error ?? 'Unable to save Login Emails.');
    loginEmails.value = data.emails;
    emailPanelSaved.value = true;
  } catch (error) {
    emailPanelError.value = error instanceof Error ? error.message : 'Unable to save account settings.';
  } finally {
    isSavingEmails.value = false;
  }
}

async function switchAccount() {
  isAccountMenuOpen.value = false;
  await signOutAndClearBrowserData();
}

async function loadAuthUser() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      user.value = null;
      return;
    }
    const data = await response.json() as { user: AuthUser; matched: boolean };
    user.value = { ...data.user, matched: data.matched };

    // Trigger last active banner if user was previously active, hasn't dismissed it in this session,
    // and the previous activity was at least 15 minutes ago.
    if (data.user?.lastActiveAt) {
      const alreadyDismissed = sessionStorage.getItem('last_active_banner_dismissed') === 'true';
      if (!alreadyDismissed && !showLastActiveBanner.value) {
        const lastActiveTime = new Date(data.user.lastActiveAt).getTime();
        const diffMs = Date.now() - lastActiveTime;
        if (diffMs > 15 * 60_000) {
          const formatted = formatLastActive(data.user.lastActiveAt);
          if (formatted) {
            lastActiveText.value = formatted;
            showLastActiveBanner.value = true;
            if (bannerTimeoutTimer) clearTimeout(bannerTimeoutTimer);
            bannerTimeoutTimer = setTimeout(() => {
              showLastActiveBanner.value = false;
              try {
                sessionStorage.setItem('last_active_banner_dismissed', 'true');
              } catch {}
            }, 20000); // Stay visible for 20 seconds for elderly users to comfortably read
          }
        }
      }
    }
  } catch {
    user.value = null;
  }
}

onMounted(loadAuthUser);
onMounted(loadSiteSettings);
watch(() => route.fullPath, loadAuthUser);
watch(siteName, (value) => { document.title = value; }, { immediate: true });
</script>

<template>
  <div class="min-h-dvh overflow-x-clip bg-app-bg text-content font-sans" :class="{ 'pt-8': envInfo }" @click="isAccountMenuOpen = false">
    <EnvironmentBanner />
    <header class="sticky z-30 border-b border-theme-border bg-surface" :class="envInfo ? 'top-8' : 'top-0'">
      <div class="relative max-w-5xl mx-auto flex items-center gap-2 px-4 py-3 sm:px-8">
        <RouterLink
          to="/home"
          class="flex min-w-0 shrink items-center gap-2 text-lg font-semibold tracking-tight text-accent sm:text-xl"
          aria-label="Go to home"
        >
          <span class="themed-logo h-10 w-10 shrink-0" aria-hidden="true" v-html="navbarLogo" />
          <span class="truncate">{{ siteName }}</span>
        </RouterLink>
        <nav v-if="user" class="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="Primary">
          <RouterLink
            v-for="item in desktopNavItems"
            :key="item.key"
            :to="item.to"
            class="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors"
            :class="item.match(route.path) ? 'bg-accent/10 text-accent' : 'text-content-muted hover:bg-surface-hover hover:text-content'"
          >
            <component :is="item.icon" class="h-4 w-4" />
            {{ item.label }}
          </RouterLink>
        </nav>
        <div class="flex shrink-0 items-center gap-2" :class="{ 'ml-auto': !user }">
          <HelpChatWidget v-if="user" />
          <div class="relative flex shrink-0 items-center gap-2" @click.stop>
            <template v-if="user">
              <button
                type="button"
                class="inline-flex min-h-11 max-w-44 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-hover hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:bg-surface-subtle sm:max-w-none"
                :aria-expanded="isAccountMenuOpen"
                aria-haspopup="menu"
                @click="toggleAccountMenu"
              >
                <span class="truncate">{{ user.displayName }}</span>
                <ChevronDown
                  class="h-4 w-4 shrink-0 text-content-muted transition-transform duration-200"
                  :class="{ 'rotate-180 text-accent': isAccountMenuOpen }"
                  aria-hidden="true"
                />
              </button>
              <div
                v-if="isAccountMenuOpen"
                class="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-theme-border bg-surface p-1.5 shadow-lg"
                role="menu"
              >
            <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-hover"
                role="menuitem"
                @click="openAboutPanel"
              >
                <Info class="h-4 w-4 text-accent" />
                About
              </button>

              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-hover"
                role="menuitem"
                @click="openAccountPanel"
              >
                <UserRound class="h-4 w-4 text-success" />
                My Account
              </button>

              <RouterLink
                v-if="canAdmin(user)"
                to="/admin"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-hover"
                role="menuitem"
                @click="isAccountMenuOpen = false"
              >
                <ShieldCheck class="h-4 w-4 text-accent-secondary" />
                Admin
              </RouterLink>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-hover"
                role="menuitem"
                @click="switchAccount"
              >
                <LogOut class="h-4 w-4" />
                Logout
              </button>
              <div class="my-1 border-t border-theme-border" />
              <div class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-content-muted">
                <Palette class="h-3.5 w-3.5" />
                Color theme
              </div>
              <button
                v-for="option in themeOptions"
                :key="option.name"
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-hover"
                role="menuitemradio"
                :aria-checked="theme === option.name"
                @click="applyTheme(option.name)"
              >
                <span class="flex shrink-0 overflow-hidden rounded-full border border-theme-border" aria-hidden="true">
                  <span v-for="color in option.colors" :key="color" class="h-3.5 w-2.5" :style="{ backgroundColor: color }" />
                </span>
                <span class="flex-1">{{ option.label }}</span>
                <Check v-if="theme === option.name" class="h-4 w-4 text-accent" />
              </button>
            </div>
          </template>
          <div v-else class="flex items-center gap-1">
            <button
              type="button"
              class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-hover hover:text-content"
              aria-label="About"
              title="About"
              @click="isAboutModalOpen = true"
            >
              <Info class="h-5 w-5" />
            </button>
            <RouterLink
              to="/login"
              class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-hover hover:text-content"
              aria-label="Sign in"
              title="Sign in"
            >
              <LogIn class="h-5 w-5" />
            </RouterLink>
          </div>
          </div>
        </div>
      </div>
    </header>

    <Transition name="banner-fade">
      <div
        v-if="showLastActiveBanner && lastActiveText"
        class="border-b border-theme-border bg-surface-subtle px-4 py-2.5 text-sm text-content shadow-xs"
        role="status"
        aria-live="polite"
      >
        <div class="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
          <div class="flex min-w-0 items-start gap-2.5 sm:items-center">
            <Clock class="mt-0.5 h-4 w-4 shrink-0 text-accent sm:mt-0" />
            <span class="wrap-break-word sm:truncate">
              Welcome back! You were last active <span class="font-semibold text-accent">{{ lastActiveText }}</span>.
            </span>
          </div>
          <button
            type="button"
            class="shrink-0 self-end rounded-full p-1 text-content-muted hover:bg-surface-hover hover:text-content sm:self-auto"
            aria-label="Dismiss last active message"
            @click="dismissLastActiveBanner"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>
    </Transition>

    <div v-if="isAccountPanelOpen" class="fixed inset-0 z-40 bg-[#1f1f1f]/20" @click="isAccountPanelOpen = false">
      <section
        class="absolute right-4 top-16 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-theme-border bg-surface p-5 shadow-xl sm:right-8"
        aria-label="Account settings"
        @click.stop
      >
        <div class="flex items-start justify-between gap-4">
          <h2 class="font-semibold">My Account</h2>
          <button type="button" class="rounded-full p-1 text-content-muted hover:bg-surface-hover" aria-label="Close account settings" @click="isAccountPanelOpen = false"><X class="h-4 w-4" /></button>
        </div>
        <p v-if="isLoadingEmails" class="py-6 text-sm text-content-muted">Loading...</p>
        <div v-else class="mt-4 space-y-2">
          <label for="profile-name" class="block text-sm font-medium text-content">Display name</label>
          <input id="profile-name" v-model="profileName" type="text" maxlength="100" placeholder="Your name" class="w-full rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />

          <h3 class="pt-3 text-sm font-medium text-content">Sign-in alias emails</h3>
          <p class="text-xs text-content-muted">Add another email address (like a work email) that you can also use to sign in. It stays private.</p>
          <div v-for="(_, index) in loginEmails" :key="index" class="flex items-center gap-2">
            <input v-model="loginEmails[index]" type="email" placeholder="work@example.com" class="min-w-0 flex-1 rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <button type="button" class="rounded-full p-2 text-danger hover:bg-danger-subtle" aria-label="Remove Login Email" @click="loginEmails.splice(index, 1)"><Trash2 class="h-4 w-4" /></button>
          </div>
          <button type="button" class="inline-flex items-center gap-1 text-sm font-medium text-accent" @click="addLoginEmail"><Plus class="h-4 w-4" /> Add email</button>
          <p v-if="emailPanelError" class="rounded-xl bg-danger-subtle p-2 text-xs text-danger">{{ emailPanelError }}</p>
          <p v-if="emailPanelSaved" class="rounded-xl bg-success-subtle p-2 text-xs text-success">Account saved.</p>
          <button type="button" :disabled="isSavingEmails" class="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60" @click="saveAccount"><Save class="h-4 w-4" /> {{ isSavingEmails ? 'Saving...' : 'Save' }}</button>
        </div>
      </section>
    </div>

    <main class="max-w-5xl mx-auto px-4 pt-6 pb-24 sm:px-8 md:pb-6">
      <router-view />
    </main>

    <nav v-if="user" class="fixed inset-x-0 bottom-0 z-30 transform-gpu border-t border-theme-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Primary">
      <div class="mx-auto flex max-w-5xl items-stretch justify-around">
        <RouterLink
          v-for="item in visibleNavItems"
          :key="item.key"
          :to="item.to"
          class="flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-xs font-medium transition-colors"
          :class="item.match(route.path) ? 'text-accent' : 'text-content-muted hover:text-content'"
        >
          <component :is="item.icon" class="h-5 w-5" />
          {{ item.label }}
        </RouterLink>
      </div>
    </nav>

    <AboutModal :open="isAboutModalOpen" @close="isAboutModalOpen = false" />
  </div>
</template>

<style scoped>
.themed-logo :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.banner-fade-enter-active,
.banner-fade-leave-active {
  transition: opacity 0.8s ease, transform 0.8s ease;
}
.banner-fade-enter-from,
.banner-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
