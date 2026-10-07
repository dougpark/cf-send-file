<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { Info, X, ArrowLeft } from 'lucide-vue-next';
import MarkdownPreview from './MarkdownPreview.vue';
import aboutContent from '../../content/about.md?raw';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) {
    emit('close');
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeyDown);
  } else {
    document.removeEventListener('keydown', onKeyDown);
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-[#1f1f1f]/50 p-0 sm:p-6 md:p-10 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        @click="emit('close')"
      >
        <section
          class="relative flex h-full w-full flex-col bg-surface sm:h-auto sm:max-h-[85vh] sm:max-w-3xl sm:rounded-3xl border-theme-border sm:border sm:shadow-2xl overflow-hidden"
          @click.stop
        >
          <!-- Header bar -->
          <header class="sticky top-0 z-10 flex items-center justify-between border-b border-theme-border bg-surface px-4 py-3 sm:px-8 sm:py-4">
            <!-- Mobile: close indicator in top left; Desktop: Left title with icon -->
            <div class="flex items-center gap-3">
              <!-- Mobile Top-Left Close Button -->
              <button
                type="button"
                class="flex sm:hidden h-9 w-9 items-center justify-center rounded-full bg-surface-subtle text-content hover:bg-surface-hover active:scale-95 transition-all"
                aria-label="Close About panel"
                @click="emit('close')"
              >
                <ArrowLeft class="h-5 w-5" />
              </button>

              <div class="flex items-center gap-2">
                <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Info class="h-4 w-4" />
                </span>
                <h2 id="about-dialog-title" class="text-lg font-semibold tracking-tight text-content sm:text-xl">
                  About
                </h2>
              </div>
            </div>

            <!-- Desktop Top-Right Close Button -->
            <button
              type="button"
              class="hidden sm:flex h-9 w-9 items-center justify-center rounded-full text-content-muted hover:bg-surface-hover hover:text-content transition-all"
              aria-label="Close dialog"
              @click="emit('close')"
            >
              <X class="h-5 w-5" />
            </button>
          </header>

          <!-- Scrollable Content Area -->
          <div class="flex-1 overflow-y-auto p-5 sm:p-8 md:p-10">
            <MarkdownPreview :source="aboutContent" />
          </div>

          <!-- Footer for easy mobile/desktop completion -->
          <footer class="border-t border-theme-border bg-surface-subtle px-4 py-3 sm:px-8 sm:py-4 flex justify-end">
            <button
              type="button"
              class="w-full sm:w-auto rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-on-accent transition-all hover:opacity-90 active:scale-95"
              @click="emit('close')"
            >
              Close
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
