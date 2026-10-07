<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { HelpCircle, Send, X } from 'lucide-vue-next';

interface HelpSource {
  title: string;
  slug: string;
  section: string;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  sources?: HelpSource[];
}

const router = useRouter();
const isOpen = ref(false);
const question = ref('');
const isSending = ref(false);
const error = ref('');
const failedQuestion = ref('');
const failedHistory = ref<Array<{ role: 'assistant' | 'user'; content: string }>>([]);
const questionInput = ref<HTMLTextAreaElement | null>(null);
const messages = ref<ChatMessage[]>([
  { role: 'assistant', content: 'Hi! Ask me how to use this site. I’ll answer from the site help guides.' },
]);
const messageList = ref<HTMLElement | null>(null);

async function sendQuestion(
  value = question.value,
  addUserMessage = true,
  historyOverride?: Array<{ role: 'assistant' | 'user'; content: string }>,
): Promise<void> {
  const text = value.trim();
  if (!text || isSending.value) return;

  const history = historyOverride ?? messages.value
    .slice(1)
    .slice(-6)
    .map(({ role, content }) => ({ role, content }));
  error.value = '';
  failedQuestion.value = '';
  if (addUserMessage) messages.value.push({ role: 'user', content: text });
  question.value = '';
  isSending.value = true;

  try {
    const response = await fetch('/api/chat/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, history }),
    });
    const data = await response.json() as { answer?: string; sources?: HelpSource[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? 'The help assistant could not answer right now.');
    if (typeof data.answer !== 'string' || !Array.isArray(data.sources)) {
      throw new Error('The help assistant returned an unexpected response. Please try again.');
    }
    messages.value.push({ role: 'assistant', content: data.answer, sources: data.sources });
    failedHistory.value = [];
  } catch (sendError) {
    error.value = sendError instanceof Error ? sendError.message : 'The help assistant could not answer right now.';
    failedQuestion.value = text;
    failedHistory.value = history;
  } finally {
    isSending.value = false;
    await nextTick();
    messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' });
  }
}

function submitQuestion(): void {
  void sendQuestion();
}

function close(): void {
  isOpen.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isOpen.value) close();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
watch(isOpen, async (open) => {
  if (!open) return;
  await nextTick();
  questionInput.value?.focus();
});

watch(messages, async () => {
  await nextTick();
  messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' });
}, { deep: true });
</script>

<template>
  <div class="relative shrink-0">
    <button
      type="button"
      class="inline-flex h-11 w-11 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-hover hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      :aria-expanded="isOpen"
      :aria-label="isOpen ? 'Close site help chat' : 'Open site help chat'"
      :aria-haspopup="isOpen ? 'dialog' : undefined"
      title="Site help"
      @click="isOpen = !isOpen"
    >
      <X v-if="isOpen" class="h-5 w-5" aria-hidden="true" />
      <HelpCircle v-else class="h-5 w-5" aria-hidden="true" />
    </button>

    <section
      v-if="isOpen"
      class="fixed right-3 top-16 z-50 flex h-[min(38rem,calc(100dvh-5.5rem))] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-theme-border bg-surface shadow-2xl sm:right-8 sm:top-20"
      role="dialog"
      aria-modal="false"
      aria-labelledby="help-chat-title"
    >
      <header class="flex items-center justify-between gap-3 border-b border-theme-border px-4 py-3">
        <div>
          <h2 id="help-chat-title" class="font-semibold text-content">Help Assistant</h2>
          <p class="text-xs text-content-muted">Answers from the site help guides</p>
        </div>
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-full text-content-muted hover:bg-surface-hover"
          aria-label="Close help chat"
          @click="close"
        >
          <X class="h-5 w-5" />
        </button>
      </header>

      <div ref="messageList" class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        <article
          v-for="(message, index) in messages"
          :key="index"
          class="flex"
          :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div class="max-w-[88%]">
            <p
              class="whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
              :class="message.role === 'user' ? 'rounded-br-md bg-accent text-on-accent' : 'rounded-bl-md bg-app-bg text-content'"
            >
              {{ message.content }}
            </p>
            <ul v-if="message.sources?.length" class="mt-2 space-y-1.5 text-xs">
              <li v-for="source in message.sources" :key="`${source.slug}-${source.section}`">
                <RouterLink
                  :to="{ path: '/help', query: { doc: source.slug } }"
                  class="inline-flex items-start gap-1 text-accent hover:underline"
                  @click="close"
                >
                  <span aria-hidden="true">↗</span>
                  <span>{{ source.title }} — {{ source.section }}</span>
                </RouterLink>
              </li>
            </ul>
          </div>
        </article>
        <p v-if="isSending" class="text-sm text-content-muted" role="status">Searching the help guides…</p>
      </div>

      <div class="border-t border-theme-border p-3">
        <p v-if="error" class="mb-2 rounded-xl bg-danger-subtle p-2.5 text-xs text-danger" role="alert">{{ error }}</p>
        <button
          v-if="failedQuestion && !isSending"
          type="button"
          class="mb-2 text-xs font-medium text-accent hover:underline"
          @click="sendQuestion(failedQuestion, false, failedHistory)"
        >
          Try again
        </button>
        <form class="flex items-end gap-2" @submit.prevent="submitQuestion">
          <label class="sr-only" for="help-chat-question">Ask a question about the site</label>
          <textarea
            ref="questionInput"
            id="help-chat-question"
            v-model="question"
            rows="1"
            maxlength="1000"
            :disabled="isSending"
            placeholder="Ask a question…"
            class="max-h-28 min-h-11 flex-1 resize-y rounded-xl border border-theme-border bg-surface px-3 py-2.5 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
            @keydown.enter.exact.prevent="submitQuestion"
          />
          <button
            type="submit"
            :disabled="isSending || !question.trim()"
            class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send question"
          >
            <Send class="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
        <RouterLink to="/help" class="mt-2 inline-block text-xs font-medium text-accent hover:underline" @click="close">
          Browse help guides
        </RouterLink>
      </div>
    </section>
  </div>
</template>
