<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';

defineProps<{
  modelValue: string;
  placeholder?: string;
  showClear?: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: string];
  clear: [];
}>();
</script>

<template>
  <div class="relative">
    <Search class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      type="text"
      :placeholder="placeholder ?? 'Search...'"
      class="w-full rounded-xl border border-theme-border bg-surface pl-11 pr-11 py-3 text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"
    />
    <button
      v-if="showClear"
      type="button"
      class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-content-muted hover:bg-app-bg transition-colors"
      aria-label="Clear search and filters"
      title="Clear search and filters"
      @click="$emit('clear')"
    >
      <X class="w-4 h-4" />
    </button>
  </div>
</template>
