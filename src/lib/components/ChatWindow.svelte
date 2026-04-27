<script lang="ts">
  import type { ChatMessage, ChatSummary } from '$lib/api/types';
  import ChatComposer from './ChatComposer.svelte';
  import MessageBubble from './MessageBubble.svelte';

  export let chat: ChatSummary;
  export let messages: ChatMessage[] = [];
  export let onBack: () => void = () => undefined;
  export let onSend: (chatId: string, text: string) => void;
  export let onRetry: (chatId: string, messageId: string) => void = () => undefined;
  export let onAttach: () => void;
</script>

<section class="chat-window" aria-label="Conversation">
  <header>
    <button class="back" aria-label="Back to chats" on:click={onBack}>‹</button>
    <div class="avatar" style={`background: ${chat.avatarGradient}`}>{chat.title.slice(0, 1)}</div>
    <div>
      <h2>{chat.title}</h2>
      <p>{chat.typing ?? (chat.kind === 'group' ? `${chat.participantCount ?? 0} participants` : 'online')}</p>
    </div>
    <button class="icon" aria-label="Video call">⌕</button>
    <button class="icon" aria-label="More options">⋮</button>
  </header>

  <div class="message-field">
    <div class="day-chip">Today</div>
    {#each messages as message (message.id)}
      <MessageBubble {message} onRetry={() => onRetry(chat.id, message.id)} />
    {/each}
  </div>

  <ChatComposer on:send={(event) => onSend(chat.id, event.detail)} on:attach={onAttach} />
</section>

<style>
  .chat-window {
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-height: 0;
    overflow: hidden;
    background-color: #efe7dd;
    background:
      linear-gradient(rgba(239, 231, 221, 0.86), rgba(239, 231, 221, 0.86)),
      radial-gradient(circle at 20% 20%, rgba(0, 128, 105, 0.09), transparent 24%),
      radial-gradient(circle at 70% 76%, rgba(0, 0, 0, 0.06), transparent 22%);
  }

  header {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    align-items: center;
    gap: 8px;
    padding: calc(9px + var(--safe-top, 0px)) 8px 9px;
    color: white;
    background: var(--wa-green, #008069);
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    color: white;
    font-weight: 950;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: white;
    font-size: 0.96rem;
    font-weight: 850;
  }

  header p {
    margin-top: 1px;
    color: rgba(255, 255, 255, 0.78);
    font-size: 0.74rem;
    font-weight: 650;
  }

  header button {
    border: 0;
    color: white;
    background: transparent;
  }

  .back {
    width: 32px;
    height: 38px;
    font-size: 2rem;
    line-height: 1;
  }

  .icon {
    width: 34px;
    height: 38px;
    font-size: 1.15rem;
  }

  .message-field {
    display: grid;
    align-content: start;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 10px 12px;
  }

  .day-chip {
    justify-self: center;
    padding: 6px 12px;
    border-radius: 999px;
    color: #667781;
    font-size: 0.74rem;
    font-weight: 850;
    background: rgba(255, 255, 255, 0.72);
  }
</style>
