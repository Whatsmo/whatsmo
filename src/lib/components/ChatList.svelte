<script lang="ts">
  import type { ChatSummary } from '$lib/api/types';

  export let chats: ChatSummary[] = [];
  export let selectedChatId = '';
  export let onSelect: (chatId: string) => void;

  const formatter = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });
</script>

<section class="chat-list" aria-label="Chats">
  <label class="search">
    <span aria-hidden="true">⌕</span>
    <input placeholder="People, groups, messages" />
  </label>

  <div class="filters" aria-label="Chat filters">
    <button class="active">All</button>
    <button>Unread</button>
    <button>Groups</button>
  </div>

  <div class="chat-list__items">
    {#if chats.length === 0}
      <div class="empty-chats">
        <div aria-hidden="true">☘</div>
        <strong>No chats synced yet</strong>
        <p>Keep Whatsmo open after pairing. New incoming and outgoing messages will appear here.</p>
      </div>
    {/if}

    {#each chats as chat (chat.id)}
      <button
        class:selected={chat.id === selectedChatId}
        class="chat-row"
        aria-label={`Open ${chat.title}`}
        on:click={() => onSelect(chat.id)}
      >
        <div class="avatar" style={`background: ${chat.avatarGradient}`}>
          {chat.title.slice(0, 1)}
        </div>
        <div class="chat-row__main">
          <div class="chat-row__title">
            <strong>{chat.title}</strong>
            <time>{formatter.format(chat.lastMessageAt)}</time>
          </div>
          <div class="chat-row__meta">
            <span class:typing={chat.typing}>{chat.typing ?? chat.subtitle}</span>
            {#if chat.muted}
              <small aria-label="Muted">⌁</small>
            {/if}
            {#if chat.unreadCount > 0}
              <b>{chat.unreadCount}</b>
            {/if}
          </div>
        </div>
      </button>
    {/each}
  </div>
</section>

<style>
  .chat-list {
    display: grid;
    grid-template-rows: auto auto 1fr;
    min-height: 0;
    background: var(--paper, #fbfbf6);
  }

  .search {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 8px;
    margin: 0 12px 10px;
    padding: 0 12px;
    border-radius: 999px;
    color: #667781;
    background: #f0f2f1;
  }

  .search input {
    min-height: 42px;
    border: 0;
    color: var(--ink, #101f1b);
    font: inherit;
    outline: none;
    background: transparent;
  }

  .filters {
    display: flex;
    gap: 8px;
    margin: 0 12px 8px;
    overflow-x: auto;
  }

  .filters button {
    flex: 0 0 auto;
    border: 0;
    padding: 8px 12px;
    border-radius: 999px;
    color: #54645f;
    font-size: 0.8rem;
    font-weight: 850;
    background: #f0f2f1;
  }

  .filters button.active {
    color: #0b211a;
    background: #d9fdd3;
  }

  .chat-list__items {
    display: grid;
    align-content: start;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 8px;
  }

  .empty-chats {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 9px;
    min-height: 260px;
    padding: 28px;
    color: #667781;
    text-align: center;
  }

  .empty-chats div {
    display: grid;
    place-items: center;
    width: 68px;
    height: 68px;
    border-radius: 999px;
    color: var(--wa-green, #008069);
    font-size: 1.8rem;
    background: #e7f6ef;
  }

  .empty-chats strong {
    color: var(--ink, #101f1b);
    font-size: 1rem;
  }

  .empty-chats p {
    max-width: 240px;
    margin: 0;
    line-height: 1.42;
  }

  .chat-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 13px;
    width: 100%;
    border: 0;
    border-radius: 0;
    padding: 11px 14px;
    color: var(--ink, #101f1b);
    text-align: left;
    background: transparent;
    transition: background 150ms ease;
  }

  .chat-row.selected,
  .chat-row:hover {
    background: #f5f7f5;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 999px;
    color: white;
    font-weight: 950;
  }

  .chat-row__main {
    min-width: 0;
    padding-bottom: 11px;
    border-bottom: 1px solid #edf0eb;
  }

  .chat-row__title,
  .chat-row__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .chat-row__title strong,
  .chat-row__meta span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  time {
    color: #667781;
    font-size: 0.73rem;
    font-weight: 750;
  }

  .chat-row__meta {
    margin-top: 5px;
    color: #667781;
    font-size: 0.84rem;
  }

  .chat-row__meta span.typing {
    color: var(--wa-green, #008069);
    font-weight: 850;
  }

  .chat-row__meta small {
    color: #8696a0;
  }

  .chat-row__meta b {
    display: grid;
    place-items: center;
    min-width: 21px;
    height: 21px;
    border-radius: 999px;
    color: white;
    font-size: 0.72rem;
    background: #25d366;
  }
</style>
