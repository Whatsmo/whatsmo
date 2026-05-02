<script lang="ts">
  import { onMount } from 'svelte';
  import type { ChatSummary, HistorySyncProgressPayload } from '$lib/api/types';
  import Icon from './Icon.svelte';

  export let chats: ChatSummary[] = [];
  export let historySync: HistorySyncProgressPayload | null = null;
  export let selectedChatId = '';
  export let onSelect: (chatId: string) => void;
  export let onTogglePin: (chatId: string) => void = () => undefined;
  export let onToggleMute: (chatId: string) => void = () => undefined;
  export let onToggleArchive: (chatId: string) => void = () => undefined;
  export let onToggleRead: (chatId: string) => void = () => undefined;

  type ChatFilter = 'all' | 'unread' | 'groups' | 'archived';

  const formatter = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });
  const LONG_PRESS_MS = 460;

  let query = '';
  let activeFilter: ChatFilter = 'all';
  let actionChat: ChatSummary | null = null;
  let longPressTimer: number | undefined;
  let suppressNextClick = false;

  $: normalizedQuery = query.trim().toLowerCase();
  $: filteredChats = chats.filter((chat) => {
    if (chat.id === 'status@broadcast') return false;

    const matchesFilter =
      (activeFilter === 'all' && !chat.archived) ||
      (activeFilter === 'unread' && !chat.archived && chat.unreadCount > 0) ||
      (activeFilter === 'groups' && !chat.archived && chat.kind === 'group') ||
      (activeFilter === 'archived' && Boolean(chat.archived));

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
  $: isSyncingHistory = historySync?.active === true;

  onMount(() => {
    const handlePopState = () => {
      if (actionChat) actionChat = null;
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.clearTimeout(longPressTimer);
    };
  });

  function startLongPress(chat: ChatSummary): void {
    window.clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      suppressNextClick = true;
      openActions(chat);
    }, LONG_PRESS_MS);
  }

  function cancelLongPress(): void {
    window.clearTimeout(longPressTimer);
  }

  function handleRowClick(chatId: string): void {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    onSelect(chatId);
  }

  function openActions(chat: ChatSummary): void {
    actionChat = chat;
    window.history.pushState({ ...(window.history.state ?? {}), chatActionsOpen: true }, '');
  }

  function closeActions(): void {
    if (actionChat) {
      window.history.back();
    }
  }

  function runAction(action: (chatId: string) => void): void {
    if (!actionChat) return;
    action(actionChat.id);
    closeActions();
  }
</script>

<section class="chat-list" aria-label="Chats">
  <label class="search">
    <span aria-hidden="true"><Icon name="search" /></span>
    <input bind:value={query} placeholder="People, groups, messages" />
  </label>

  <div class="filters" aria-label="Chat filters">
    <button class:active={activeFilter === 'all'} aria-pressed={activeFilter === 'all'} on:click={() => (activeFilter = 'all')}>All</button>
    <button class:active={activeFilter === 'unread'} aria-pressed={activeFilter === 'unread'} on:click={() => (activeFilter = 'unread')}>Unread</button>
    <button class:active={activeFilter === 'groups'} aria-pressed={activeFilter === 'groups'} on:click={() => (activeFilter = 'groups')}>Groups</button>
    <button class:active={activeFilter === 'archived'} aria-pressed={activeFilter === 'archived'} on:click={() => (activeFilter = 'archived')}>Archived</button>
  </div>

  <div class="chat-list__items">
    {#if isSyncingHistory && chats.length === 0}
      <div class="skeleton-list" aria-label="Loading chats">
        {#each Array(6) as _}
          <div class="skeleton-row">
            <div class="skeleton-avatar"></div>
            <div class="skeleton-lines">
              <div class="skeleton-line-title"></div>
              <div class="skeleton-line-subtitle"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else if filteredChats.length === 0}
      <div class="empty-chats">
        <div aria-hidden="true"><Icon name="chat" size="2rem" /></div>
        <strong>{emptyTitle}</strong>
        <p>{emptyMessage}</p>
      </div>
    {/if}

    {#each filteredChats as chat (chat.id)}
      <button
        class:selected={chat.id === selectedChatId}
        class="chat-row"
        aria-label={`Open ${chat.title}`}
        on:click={() => handleRowClick(chat.id)}
        on:contextmenu|preventDefault={() => openActions(chat)}
        on:pointercancel={cancelLongPress}
        on:pointerdown={() => startLongPress(chat)}
        on:pointerleave={cancelLongPress}
        on:pointerup={cancelLongPress}
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
              <small aria-label="Muted"><Icon name="volume-off" size="16px" /></small>
            {/if}
            {#if chat.pinned}
              <small aria-label="Pinned">●</small>
            {/if}
            {#if chat.unreadCount > 0}
              <b>{chat.unreadCount}</b>
            {/if}
          </div>
        </div>
      </button>
    {/each}
  </div>

  {#if actionChat}
    <div class="action-backdrop">
      <button class="action-dismiss" aria-label="Close chat actions" on:click={closeActions}></button>
      <section class="action-sheet" aria-label={`Actions for ${actionChat.title}`}>
        <div class="action-title">
          <strong>{actionChat.title}</strong>
          <span>{actionChat.archived ? 'Archived chat' : actionChat.kind === 'group' ? 'Group chat' : 'Direct chat'}</span>
        </div>
        <button on:click={() => runAction(onTogglePin)}>{actionChat.pinned ? 'Unpin chat' : 'Pin chat'}</button>
        <button on:click={() => runAction(onToggleRead)}>{actionChat.unreadCount > 0 ? 'Mark as read' : 'Mark as unread'}</button>
        <button on:click={() => runAction(onToggleMute)}>{actionChat.muted ? 'Unmute notifications' : 'Mute notifications'}</button>
        <button on:click={() => runAction(onToggleArchive)}>{actionChat.archived ? 'Unarchive chat' : 'Archive chat'}</button>
      </section>
    </div>
  {/if}
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
    gap: 12px;
    margin: 4px 16px 12px;
    padding: 0 16px;
    border-radius: 24px;
    color: var(--muted);
    background: var(--border-color);
  }

  .search input {
    min-height: 44px;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: 0.95rem;
    outline: none;
    background: transparent;
  }

  .search input::placeholder {
    color: var(--muted);
  }

  .filters {
    display: flex;
    gap: 8px;
    margin: 0 16px 12px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .filters::-webkit-scrollbar {
    display: none;
  }

  .filters button {
    flex: 0 0 auto;
    border: 0;
    padding: 6px 16px;
    border-radius: 16px;
    color: var(--muted);
    font-size: 0.9rem;
    font-weight: 500;
    background: var(--border-color);
    cursor: pointer;
  }

  .filters button.active {
    color: var(--wa-green-dark);
    background: var(--nav-active);
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

  .skeleton-list {
    display: grid;
    gap: 16px;
    padding: 12px 16px;
  }

  .skeleton-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 16px;
    align-items: center;
  }

  .skeleton-avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: var(--border-color);
    animation: pulse 1.5s infinite ease-in-out;
  }

  .skeleton-lines {
    display: grid;
    gap: 10px;
  }

  .skeleton-line-title {
    height: 16px;
    width: 40%;
    border-radius: 8px;
    background: var(--border-color);
    animation: pulse 1.5s infinite ease-in-out;
  }

  .skeleton-line-subtitle {
    height: 14px;
    width: 70%;
    border-radius: 7px;
    background: var(--border-color);
    animation: pulse 1.5s infinite ease-in-out;
    opacity: 0.6;
  }

  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.4; }
    100% { opacity: 1; }
  }

  .chat-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 16px;
    width: 100%;
    border: 0;
    border-radius: 0;
    padding: 12px 16px;
    color: var(--ink);
    text-align: left;
    background: transparent;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
  }

  .chat-row:active {
    background: var(--nav-active);
  }

  .chat-row.selected {
    background: var(--nav-active);
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    color: white;
    font-size: 1.2rem;
    font-weight: 500;
    overflow: hidden;
  }

  .avatar.has-image {
    background: var(--border-color) !important;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .chat-row__main {
    min-width: 0;
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
    font-weight: 500;
    font-size: 1.05rem;
  }

  .chat-row__title strong,
  .chat-row__meta span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  time {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 400;
  }

  .chat-row__meta {
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.875rem;
  }

  .chat-row__meta span.typing {
    color: var(--wa-green);
    font-weight: 600;
  }

  .chat-row__meta small {
    color: var(--muted);
  }

  .chat-row__meta b {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    color: var(--paper);
    font-size: 0.7rem;
    font-weight: 600;
    background: var(--wa-green);
  }

  .action-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    align-items: end;
    background: rgba(0, 0, 0, 0.35);
  }

  .action-dismiss {
    position: absolute;
    inset: 0;
    border: 0;
    background: transparent;
  }

  .action-sheet {
    position: relative;
    z-index: 1;
    display: grid;
    margin: 0 auto;
    width: min(100%, 430px);
    border-radius: 28px 28px 0 0;
    padding: 24px 0 max(16px, calc(16px + var(--safe-bottom)));
    background: var(--paper);
    box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.25);
  }

  .action-title {
    display: grid;
    gap: 4px;
    margin-bottom: 12px;
    padding: 0 24px;
  }

  .action-title strong {
    color: var(--ink);
    font-size: 1.2rem;
    font-weight: 500;
  }

  .action-title span {
    color: var(--muted);
    font-size: 0.875rem;
  }

  .action-sheet button {
    min-height: 56px;
    border: 0;
    padding: 0 24px;
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
    font-weight: 500;
    text-align: left;
    background: transparent;
    transition: background 0.2s ease;
  }

  .action-sheet button:active {
    background: var(--border-color);
  }
</style>
