<script setup lang="ts">
import { X } from 'lucide-vue-next';

defineProps<{
  title?: string;
}>();

defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="$emit('close')">
    <div class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-theme-border bg-surface p-6 shadow-lg sm:p-8">
      <div class="flex items-start justify-between gap-4">
        <h3 v-if="title" class="text-lg font-semibold text-content">{{ title }}</h3>
        <button
          type="button"
          class="ml-auto rounded-full p-2 text-content-muted hover:bg-app-bg"
          aria-label="Close"
          @click="$emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
      <div class="mt-4">
        <slot />
      </div>
    </div>
  </div>
</template>
