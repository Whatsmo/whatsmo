<script lang="ts">
  import type { ChatSummary } from '$lib/api/types';

  export let chats: ChatSummary[] = [];
  export let selectedChatId = '';
  export let onSelect: (chatId: string) => void;

  type ChatFilter = 'all' | 'unread' | 'groups';

  const formatter = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });

  let query = '';
  let activeFilter: ChatFilter = 'all';

  $: normalizedQuery = query.trim().toLowerCase();
  $: filteredChats = chats.filter((chat) => {
    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'unread' && chat.unreadCount > 0) ||
      (activeFilter === 'groups' && chat.kind === 'group');

    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;

    return [chat.title, chat.subtitle, chat.id, chat.kind]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });

  $: emptyTitle = chats.length === 0 ? 'No chats synced yet' : 'No matching chats';
  $: emptyMessage =
    chats.length === 0
      ? 'Keep Whatsmo open after pairing. New incoming and outgoing messages will appear here.'
      : 'Try a different search or filter.';
</script>

<section class="chat-list" aria-label="Chats">
  <label class="search">
    <span class="material-symbols-rounded" aria-hidden="true">search</span>
    <input bind:value={query} placeholder="People, groups, messages" />
  </label>

  <div class="filters" aria-label="Chat filters">
    <button class:active={activeFilter === 'all'} aria-pressed={activeFilter === 'all'} on:click={() => (activeFilter = 'all')}>All</button>
    <button class:active={activeFilter === 'unread'} aria-pressed={activeFilter === 'unread'} on:click={() => (activeFilter = 'unread')}>Unread</button>
    <button class:active={activeFilter === 'groups'} aria-pressed={activeFilter === 'groups'} on:click={() => (activeFilter = 'groups')}>Groups</button>
  </div>

  <div class="chat-list__items">
    {#if filteredChats.length === 0}
      <div class="empty-chats">
        <div aria-hidden="true"><span class="material-symbols-rounded" style="font-size: 2rem;">chat</span></div>
        <strong>{emptyTitle}</strong>
        <p>{emptyMessage}</p>
      </div>
    {/if}

    {#each filteredChats as chat (chat.id)}
      <button
        class:selected={chat.id === selectedChatId}
        class="chat-row"
        aria-label={`Open ${chat.title}`}
        on:click={() => onSelect(chat.id)}
      >
        <div class:has-image={Boolean(chat.avatarUrl)} class="avatar" style={`background: ${chat.avatarGradient}`}>
          {#if chat.avatarUrl}
            <img src={chat.avatarUrl} alt="" loading="lazy" referrerpolicy="no-referrer" />
          {:else}
            {chat.title.slice(0, 1)}
          {/if}
        </div>
        <div class="chat-row__main">
          <div class="chat-row__title">
            <strong>{chat.title}</strong>
            <time>{formatter.format(chat.lastMessageAt)}</time>
          </div>
          <div class="chat-row__meta">
            <span class:typing={chat.typing}>{chat.typing ?? chat.subtitle}</span>
            {#if chat.muted}
              <small aria-label="Muted"><span class="material-symbols-rounded" style="font-size: 16px;">volume_off</span></small>
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
    color: var(--muted, #667781);
    background: var(--nav-active, #f0f2f1);
  }

  .search input {
    min-height: 42px;
    border: 0;
    color: var(--ink, #101f1b);
    font: inherit;
    outline: none;
    background: transparent;
  }

  .search input::placeholder {
    color: var(--muted, #667781);
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
    color: var(--ink, #54645f);
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--nav-active, #f0f2f1);
    cursor: pointer;
  }

  .filters button.active {
    color: var(--wa-green-dark, #0b211a);
    background: var(--wa-mint, #d9fdd3);
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
    gap: 15px;
    width: 100%;
    border: 0;
    border-radius: 0;
    padding: 12px 16px;
    color: var(--ink, #101f1b);
    text-align: left;
    background: transparent;
    transition: background 0.2s ease;
    cursor: pointer;
  }

  .chat-row:active {
    background: rgba(0, 0, 0, 0.05);
  }

  .chat-row.selected {
    background: var(--nav-active, #f5f7f5);
  }

  /* Add support for active states across dark/light mode */
  :global(.device[data-theme="dark"]) .chat-row:active {
    background: rgba(255, 255, 255, 0.05);
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    color: white;
    font-size: 1.2rem;
    font-weight: 500;
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

  .chat-row__main {
    min-width: 0;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color, #edf0eb);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .chat-row__title,
  .chat-row__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .chat-row__title strong {
    font-weight: 600;
    font-size: 1.05rem;
  }

  .chat-row__title strong,
  .chat-row__meta span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  time {
    color: var(--muted, #667781);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .chat-row__meta {
    margin-top: 5px;
    color: var(--muted, #667781);
    font-size: 0.85rem;
  }

  .chat-row__meta span.typing {
    color: var(--wa-green, #008069);
    font-weight: 850;
  }

  .chat-row__meta small {
    color: #8696a0;
  }

  .chat-row__meta b {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 10px;
    color: white;
    font-size: 0.65rem;
    font-weight: bold;
    background: #25d366;
  }
</style>
