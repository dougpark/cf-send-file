<script setup lang="ts">
import { Check } from 'lucide-vue-next';

defineProps<{
  modelValue: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
}>();
</script>

<template>
  <label
    :class="[
      'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium cursor-pointer transition-all select-none',
      modelValue
        ? 'border-accent bg-accent text-on-accent shadow-sm'
        : 'border-theme-border bg-surface text-content-muted hover:bg-app-bg'
    ]"
  >
    <input
      type="checkbox"
      :checked="modelValue"
      class="sr-only"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <Check v-if="modelValue" class="h-4 w-4" aria-hidden="true" />
    <slot />
  </label>
</template>
