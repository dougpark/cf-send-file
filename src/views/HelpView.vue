<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSiteSettings } from '../composables/useSiteSettings';
import MarkdownPreview from '../components/common/MarkdownPreview.vue';

interface HelpGuide {
  slug: string;
  title: string;
  content: string;
}

const { siteName } = useSiteSettings();
const route = useRoute();
const router = useRouter();
const rawGuides = import.meta.glob('../content/docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const guides: HelpGuide[] = Object.entries(rawGuides)
  .filter(([path]) => !path.endsWith('/index.md'))
  .map(([path, content]) => {
    const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
    const title = content.split(/\r?\n/).find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim() ?? slug;
    return { slug, title, content };
  })
  .sort((left, right) => left.title.localeCompare(right.title));

const selectedSlug = computed(() => typeof route.query.doc === 'string' ? route.query.doc : '');
const selectedGuide = computed(() => guides.find((guide) => guide.slug === selectedSlug.value) ?? null);

watch(selectedGuide, async (guide) => {
  if (selectedSlug.value && !guide) {
    await router.replace({ path: '/help' });
  }
  if (guide) document.title = `${guide.title} | ${siteName.value} Help`;
}, { immediate: true });
</script>

<template>
  <section class="space-y-6 py-4 sm:py-8">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight text-content">{{ selectedGuide?.title ?? 'Help Center' }}</h1>
      <p class="mt-2 max-w-2xl text-content-muted">
        {{ selectedGuide ? 'Read this guide or choose another topic below.' : `Guides for using ${siteName}.` }}
      </p>
    </div>

    <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
      <article v-if="selectedGuide" class="min-w-0 rounded-3xl border border-theme-border bg-surface p-5 shadow-sm sm:p-7">
        <MarkdownPreview :source="selectedGuide.content" />
      </article>
      <div v-else class="rounded-3xl border border-theme-border bg-surface p-5 text-sm text-content-muted shadow-sm sm:p-7">
        Select a guide to learn about signing in, your account, the help assistant, or staff tools.
      </div>

      <nav aria-label="Help topics" class="space-y-2">
        <h2 class="px-2 text-sm font-semibold uppercase tracking-wide text-content-muted">Help topics</h2>
        <RouterLink
          v-for="guide in guides"
          :key="guide.slug"
          :to="{ path: '/help', query: { doc: guide.slug } }"
          class="block rounded-xl px-3 py-2.5 text-sm transition-colors"
          :class="selectedGuide?.slug === guide.slug ? 'bg-accent text-on-accent' : 'text-content hover:bg-surface-hover'"
        >
          {{ guide.title }}
        </RouterLink>
      </nav>
    </div>
  </section>
</template>
