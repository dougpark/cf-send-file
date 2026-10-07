<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { sanitizeHtml } from '../../lib/sanitize';
import { createMarkdownRenderer } from '../../lib/markdown';
import 'github-markdown-css/github-markdown.css';

const props = defineProps<{ source: string }>();

// html: true is required for underline (<u>) support, so the output is sanitized with DOMPurify
// (strips <script>, on* handlers, javascript: URLs) before it reaches v-html.
const md = createMarkdownRenderer();

const rendered = computed(() => sanitizeHtml(md.render(props.source ?? '')));
const router = useRouter();

// Same-origin links to app routes use the router instead of a full page load;
// modifier-clicks (new tab, etc.) still work normally.
function onContentClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    const location = `${url.pathname}${url.search}${url.hash}`;
    if (!router.resolve(location).matched.length) return;
    event.preventDefault();
    void router.push(location);
}
</script>

<template>
  <article class="markdown-body" v-html="rendered" @click="onContentClick" />
</template>

<style scoped>
.markdown-body {
    background: transparent;
    color: var(--theme-text);
    --fgColor-default: var(--theme-text);
    --fgColor-muted: var(--theme-text-muted);
    --fgColor-accent: var(--theme-accent);
    --bgColor-default: transparent;
    --borderColor-default: var(--theme-border);
    font-family: inherit;
    font-size: 1rem;
    box-sizing: border-box;
    min-width: 0;
}

.markdown-body :deep(img) {
    display: block;
    max-width: 100%;
    height: auto;
    margin-left: auto;
    margin-right: auto;
}

.markdown-body :deep(.task-list-item) {
    list-style-type: none;
}

.markdown-body :deep(.task-list-item-checkbox) {
    margin: 0 0.5rem 0.2rem -1.4rem;
    vertical-align: middle;
}
</style>
