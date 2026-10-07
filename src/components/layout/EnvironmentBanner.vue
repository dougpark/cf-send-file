<script setup lang="ts">
import { useEnvironmentBanner } from '../../composables/useEnvironmentBanner';

const envInfo = useEnvironmentBanner();
</script>

<template>
  <div
    v-if="envInfo"
    class="fixed inset-x-0 top-0 z-40 flex h-8 items-center justify-center text-xs font-bold uppercase tracking-wide"
    :class="envInfo.theme === 'staging' ? 'bg-amber-400 text-amber-950' : 'bg-green-500 text-green-950'"
  >
    {{ envInfo.label }}
  </div>
</template>
