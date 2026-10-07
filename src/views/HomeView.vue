<script setup lang="ts">
import { LifeBuoy, UserRound } from 'lucide-vue-next';
import { useSiteSettings } from '../composables/useSiteSettings';

const { siteName } = useSiteSettings();

// Replace these with the main features of your app.
const cards = [
  {
    title: 'Help Center',
    description: 'Guides for using this site',
    to: '/help',
    icon: LifeBuoy,
    color: 'bg-accent/10 text-accent',
  },
  {
    title: 'Getting started',
    description: 'How to sign in and manage your account',
    to: '/help?doc=getting-started-and-sign-in',
    icon: UserRound,
    color: 'bg-success-subtle text-success',
  },
];
</script>

<template>
  <section class="space-y-8 py-4 sm:py-8">
    <div>
      <h2 class="mt-2 text-3xl font-semibold tracking-tight text-content">Welcome to {{ siteName }}</h2>
      <p class="mt-2 max-w-xl text-content-muted">This is the members-only home page. Replace these cards with your app's features.</p>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <RouterLink
        v-for="card in cards"
        :key="card.title"
        :to="card.to"
        class="group rounded-3xl border border-theme-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <div class="flex items-center gap-4">
          <div :class="['flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', card.color]">
            <component :is="card.icon" class="h-6 w-6" />
          </div>
          <div>
            <h3 class="text-xl font-semibold text-content transition-colors group-hover:text-accent">{{ card.title }}</h3>
            <p class="mt-1 text-content-muted">{{ card.description }}</p>
          </div>
        </div>
      </RouterLink>
    </div>
  </section>
</template>
