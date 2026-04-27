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

  const MESSAGE_PAGE_SIZE = 50;

  let currentChatId = '';
  let visibleMessageCount = MESSAGE_PAGE_SIZE;

  $: if (chat.id !== currentChatId) {
    currentChatId = chat.id;
    visibleMessageCount = MESSAGE_PAGE_SIZE;
  }

  $: hiddenMessageCount = Math.max(messages.length - visibleMessageCount, 0);
  $: visibleMessages = messages.slice(Math.max(messages.length - visibleMessageCount, 0));

  function loadOlderMessages(): void {
    visibleMessageCount = Math.min(messages.length, visibleMessageCount + MESSAGE_PAGE_SIZE);
  }

  $: groupMetaLabel = chat.kind === 'group'
    ? `${chat.participantCount ?? 0} participants${chat.groupAdminCount ? ` · ${chat.groupAdminCount} admins` : ''}${chat.groupIsAnnouncement ? ' · announcement' : ''}`
    : 'online';
</script>

<section class="chat-window" aria-label="Conversation">
  <header>
    <button class="back" aria-label="Back to chats" on:click={onBack}><span class="material-symbols-rounded">arrow_back</span></button>
    <div class:has-image={Boolean(chat.avatarUrl)} class="avatar" style={`background: ${chat.avatarGradient}`}>
      {#if chat.avatarUrl}
        <img src={chat.avatarUrl} alt="" loading="lazy" referrerpolicy="no-referrer" />
      {:else}
        {chat.title.slice(0, 1)}
      {/if}
    </div>
    <div>
      <h2>{chat.title}</h2>
      <p>{chat.typing ?? groupMetaLabel}</p>
    </div>
    <button class="icon" aria-label="Video call"><span class="material-symbols-rounded">videocam</span></button>
    <button class="icon" aria-label="More options"><span class="material-symbols-rounded">more_vert</span></button>
  </header>

  <div class="message-field">
    {#if hiddenMessageCount > 0}
      <button class="load-older" on:click={loadOlderMessages}>
        Load {Math.min(hiddenMessageCount, MESSAGE_PAGE_SIZE)} older messages
      </button>
    {/if}
    <div class="day-chip">Today</div>
    {#each visibleMessages as message (message.id)}
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
    background-color: var(--app-bg, #efe7dd);
    background-image: 
      linear-gradient(var(--app-bg), var(--app-bg)),
      radial-gradient(circle at 20% 20%, rgba(0, 128, 105, 0.09), transparent 24%),
      radial-gradient(circle at 70% 76%, rgba(0, 0, 0, 0.06), transparent 22%);
  }

  header {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    align-items: center;
    gap: 8px;
    padding: calc(9px + var(--safe-top, 0px)) 8px 9px;
    color: var(--ink, #101f1b);
    background: var(--paper, #fbfbf6);
    border-bottom: 1px solid var(--border-color, #edf0eb);
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    color: white;
    font-weight: 950;
    overflow: hidden;
  }

  .avatar.has-image {
    background: #dfe5e1 !important;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--ink, #101f1b);
    font-size: 0.96rem;
    font-weight: 850;
  }

  header p {
    margin-top: 1px;
    color: var(--muted, #667781);
    font-size: 0.74rem;
    font-weight: 650;
  }

  header button {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    color: var(--ink, #101f1b);
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

  .load-older {
    justify-self: center;
    min-height: 34px;
    border: 0;
    border-radius: 999px;
    padding: 0 13px;
    color: #075e54;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 900;
    background: rgba(255, 255, 255, 0.78);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
  }
</style>
