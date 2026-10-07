<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ChevronDown, ChevronRight, MonitorX } from 'lucide-vue-next';
import BaseInput from '../components/ui/BaseInput.vue';

interface LoginUser {
  id: number;
  email: string;
  displayName: string;
  isSuspended: boolean;
  isMember: boolean;
  lastLoginAt: string | null;
  sessionCount: number;
  lastSeenAt: string | null;
}

interface SessionDetail {
  id: number;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  expiresAt: string;
}

interface LogEntry {
  id: number;
  category: string;
  action: string;
  details: string | null;
  createdAt: string;
  actorEmail: string | null;
  targetEmail: string | null;
}

const searchQuery = ref('');
const loginUsers = ref<LoginUser[]>([]);
const expandedUserId = ref<number | null>(null);
const sessionsByUser = ref<Record<number, SessionDetail[]>>({});
const logQuery = ref('');
const logs = ref<LogEntry[]>([]);
const error = ref('');
const message = ref('');
const createdLink = ref<{ userId: number; url: string; expiresInHours: number } | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadLoginUsers() {
  const query = searchQuery.value.trim();
  if (!query) {
    loginUsers.value = [];
    return;
  }
  const response = await fetch(`/api/admin/login-users?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error('Unable to load users.');
  loginUsers.value = await response.json() as LoginUser[];
}

async function loadLogs() {
  const params = new URLSearchParams({ category: 'user_management' });
  if (logQuery.value.trim()) params.set('q', logQuery.value.trim());
  const response = await fetch(`/api/admin/log-viewer/logs?${params.toString()}`);
  if (!response.ok) return;
  logs.value = await response.json() as LogEntry[];
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadLoginUsers().catch((loadError) => { error.value = loadError instanceof Error ? loadError.message : 'Unable to load users.'; });
  }, 250);
}

async function toggleSessions(user: LoginUser) {
  if (expandedUserId.value === user.id) {
    expandedUserId.value = null;
    return;
  }
  expandedUserId.value = user.id;
  if (!sessionsByUser.value[user.id]) {
    const response = await fetch(`/api/admin/users/${user.id}/sessions`);
    if (response.ok) sessionsByUser.value[user.id] = await response.json() as SessionDetail[];
  }
}

async function revokeSession(user: LoginUser, session: SessionDetail) {
  error.value = '';
  message.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/sessions/${session.id}`, { method: 'DELETE' });
  const data = await response.json() as { error?: string };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to revoke session.';
    return;
  }
  sessionsByUser.value[user.id] = (sessionsByUser.value[user.id] ?? []).filter((item) => item.id !== session.id);
  user.sessionCount = Math.max(0, user.sessionCount - 1);
  message.value = 'Session revoked.';
  loadLogs();
}

async function forceLogout(user: LoginUser) {
  if (!confirm(`Force logout ${user.displayName}? This immediately revokes all of their active sessions.`)) return;
  error.value = '';
  message.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/force-logout`, { method: 'POST' });
  const data = await response.json() as { error?: string; sessionsRemoved?: number };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to force logout.';
    return;
  }
  user.sessionCount = 0;
  delete sessionsByUser.value[user.id];
  message.value = `Signed out of ${data.sessionsRemoved ?? 0} session(s).`;
  loadLogs();
}

async function toggleSuspend(user: LoginUser) {
  const nextValue = !user.isSuspended;
  if (nextValue && !confirm(`Suspend ${user.displayName}? They will be immediately signed out and unable to sign in.`)) return;
  error.value = '';
  message.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/suspend`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suspended: nextValue }),
  });
  const data = await response.json() as { error?: string; isSuspended?: boolean };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to update suspension status.';
    return;
  }
  user.isSuspended = Boolean(data.isSuspended);
  if (user.isSuspended) {
    user.sessionCount = 0;
    delete sessionsByUser.value[user.id];
  }
  message.value = user.isSuspended ? 'Account suspended.' : 'Account reinstated.';
  loadLogs();
}

async function toggleMembership(user: LoginUser) {
  const nextValue = !user.isMember;
  if (!nextValue && !confirm(`Remove membership for ${user.displayName}? They will keep their account but lose access to member pages.`)) return;
  error.value = '';
  message.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/membership`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isMember: nextValue }),
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to update membership.';
    return;
  }
  user.isMember = nextValue;
  message.value = nextValue ? 'Membership granted.' : 'Membership removed.';
  loadLogs();
}

async function sendMagicLink(user: LoginUser) {
  error.value = '';
  message.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/send-magic-link`, { method: 'POST' });
  const data = await response.json() as { error?: string };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to send sign-in link.';
    return;
  }
  message.value = `Sign-in link sent to ${user.email}.`;
  loadLogs();
}

async function createLoginLink(user: LoginUser) {
  error.value = '';
  message.value = '';
  createdLink.value = null;
  const response = await fetch(`/api/admin/users/${user.id}/login-link`, { method: 'POST' });
  const data = await response.json() as { error?: string; url?: string; expiresInHours?: number };
  if (!response.ok || !data.url) {
    error.value = data.error ?? 'Unable to create sign-in link.';
    return;
  }
  createdLink.value = { userId: user.id, url: data.url, expiresInHours: data.expiresInHours ?? 48 };
  message.value = `Sign-in link created for ${user.email}. Copy it now; it works once and expires in ${createdLink.value.expiresInHours} hours.`;
  loadLogs();
}

// Runs straight from the click with no prior await, which Safari requires for clipboard writes.
async function copyLoginLink(user: LoginUser) {
  const link = createdLink.value;
  if (!link || link.userId !== user.id) return;
  error.value = '';
  try {
    await navigator.clipboard.writeText(link.url);
    message.value = `Sign-in link for ${user.email} copied.`;
  } catch {
    error.value = 'Could not copy automatically. Select the link below and copy it by hand.';
  }
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function formatDetails(entry: LogEntry): string {
  switch (entry.action) {
    case 'suspend': return 'suspended the account';
    case 'unsuspend': return 'reinstated the account';
    case 'force_logout': return 'forced logout';
    case 'grant_membership': return 'granted membership';
    case 'revoke_membership': return 'removed membership';
    case 'create_user': return 'created the account';
    case 'revoke_session': return 'revoked a session';
    case 'magic_link_dispatch': return 'sent a sign-in link';
    case 'magic_link_copy': return 'copied a sign-in link';
    default: return entry.action;
  }
}

onMounted(() => {
  loadLogs();
});
</script>

<template>
  <section class="space-y-8">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Login Accounts</h2>
      <p class="mt-2 text-content-muted">Manage membership, account status, sessions, and sign-in links.</p>
    </div>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    <p v-if="message" class="rounded-xl bg-success-subtle p-3 text-sm text-success">{{ message }}</p>

    <div class="flex flex-wrap items-center gap-3">
      <BaseInput v-model="searchQuery" placeholder="Search users by name or email..." class="w-full" @update:model-value="scheduleSearch" />
    </div>

    <div class="space-y-3">
      <p v-if="!searchQuery.trim()" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">Search for a user by name or email to manage their account.</p>
      <p v-else-if="!loginUsers.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No matching users.</p>
      <div v-for="user in loginUsers" :key="user.id" class="rounded-3xl border border-theme-border bg-surface p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="font-medium text-content">{{ user.displayName }}</p>
            <p class="text-xs text-content-muted">{{ user.email }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-4 text-xs text-content-muted">
            <span :class="user.isSuspended ? 'rounded-full bg-danger-subtle px-2 py-0.5 text-danger' : 'rounded-full bg-success-subtle px-2 py-0.5 text-success'">
              {{ user.isSuspended ? 'Suspended' : 'Active' }}
            </span>
            <span :class="user.isMember ? 'rounded-full bg-accent/10 px-2 py-0.5 text-accent' : 'rounded-full bg-app-bg px-2 py-0.5'">
              {{ user.isMember ? 'Member' : 'Not a member' }}
            </span>
            <span>Last login: {{ formatDate(user.lastLoginAt) }}</span>
            <button type="button" class="inline-flex items-center gap-1 hover:text-accent" @click="toggleSessions(user)">
              <component :is="expandedUserId === user.id ? ChevronDown : ChevronRight" class="h-3.5 w-3.5" />
              {{ user.sessionCount }} active session{{ user.sessionCount === 1 ? '' : 's' }}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="rounded-full border border-theme-border px-3 py-1.5 text-sm font-medium hover:bg-app-bg" @click="toggleMembership(user)">
              {{ user.isMember ? 'Remove Membership' : 'Make Member' }}
            </button>
            <button type="button" class="rounded-full border border-theme-border px-3 py-1.5 text-sm font-medium hover:bg-app-bg" @click="sendMagicLink(user)">
              Send Magic Link
            </button>
            <button
              v-if="createdLink?.userId === user.id"
              type="button"
              class="rounded-full border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10"
              @click="copyLoginLink(user)"
            >
              Copy Login Link
            </button>
            <button v-else type="button" class="rounded-full border border-theme-border px-3 py-1.5 text-sm font-medium hover:bg-app-bg" :disabled="user.isSuspended" @click="createLoginLink(user)">
              Create Login Link
            </button>
            <button type="button" class="rounded-full border border-theme-border px-3 py-1.5 text-sm font-medium hover:bg-app-bg" @click="forceLogout(user)">
              Force Logout
            </button>
            <button
              type="button"
              class="rounded-full px-3 py-1.5 text-sm font-medium"
              :class="user.isSuspended ? 'border border-accent text-accent hover:bg-accent/10' : 'border border-danger text-danger hover:bg-danger-subtle'"
              @click="toggleSuspend(user)"
            >
              {{ user.isSuspended ? 'Unsuspend' : 'Suspend' }}
            </button>
          </div>
        </div>

        <div v-if="createdLink?.userId === user.id" class="mt-4 border-t border-theme-border pt-4">
          <input :value="createdLink.url" readonly type="text" aria-label="Sign-in link" class="w-full rounded-xl border border-theme-border bg-surface px-4 py-3 text-sm text-content" @focus="($event.target as HTMLInputElement).select()" />
        </div>

        <div v-if="expandedUserId === user.id" class="mt-4 space-y-2 border-t border-theme-border pt-4">
          <p v-if="!sessionsByUser[user.id]?.length" class="text-sm text-content-muted">No active sessions.</p>
          <div v-for="session in sessionsByUser[user.id]" :key="session.id" class="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-app-bg px-4 py-2 text-sm">
            <span class="text-content-muted">
              {{ session.userAgent ?? 'Unknown device' }}
              <span v-if="session.ipAddress"> · {{ session.ipAddress }}</span>
              <span> · Last seen {{ formatDate(session.lastSeenAt) }}</span>
            </span>
            <button type="button" class="rounded-full p-1.5 text-danger hover:bg-danger-subtle" aria-label="Revoke this session" title="Revoke this session" @click="revokeSession(user, session)">
              <MonitorX class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <h3 class="text-lg font-semibold">Activity Log</h3>
      <BaseInput v-model="logQuery" placeholder="Search activity log..." @update:model-value="loadLogs" />
      <p v-if="!logs.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No login user activity yet.</p>
      <ul v-else class="divide-y divide-theme-border rounded-3xl border border-theme-border bg-surface">
        <li v-for="entry in logs" :key="entry.id" class="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
          <span>
            <span class="font-medium text-content">{{ entry.actorEmail ?? 'Unknown' }}</span>
            <span class="text-content-muted"> {{ formatDetails(entry) }} for </span>
            <span class="font-medium text-content">{{ entry.targetEmail ?? 'Unknown' }}</span>
          </span>
          <span class="text-xs text-content-muted">{{ new Date(entry.createdAt).toLocaleString() }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
