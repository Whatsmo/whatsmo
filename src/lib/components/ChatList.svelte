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
    background: var(--paper);
  }

  .search {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 10px;
    margin: 6px 14px 6px;
    padding: 0 14px;
    border-radius: 20px;
    color: var(--muted);
    background: var(--border-color);
  }

  .search input {
    min-height: 36px;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: 0.875rem;
    outline: none;
    background: transparent;
  }

  .search input::placeholder {
    color: var(--muted);
  }

  .filters {
    display: flex;
    gap: 6px;
    margin: 2px 14px 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .filters::-webkit-scrollbar {
    display: none;
  }

  .filters button {
    flex: 0 0 auto;
    border: 0;
    padding: 0 14px;
    height: 32px;
    border-radius: 16px;
    color: var(--ink);
    font-size: 0.8125rem;
    font-weight: 500;
    background: var(--border-color);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
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
    -webkit-overflow-scrolling: touch;
  }

  .empty-chats {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 8px;
    min-height: 260px;
    padding: 32px;
    color: var(--muted);
    text-align: center;
  }

  .empty-chats div {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 999px;
    color: var(--wa-green);
    font-size: 1.6rem;
    background: var(--nav-active);
  }

  .empty-chats strong {
    color: var(--ink);
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .empty-chats p {
    max-width: 240px;
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  .skeleton-list {
    display: grid;
    padding: 0 14px;
  }

  .skeleton-row {
    display: grid;
    grid-template-columns: 52px 1fr;
    gap: 14px;
    align-items: center;
    height: 72px;
  }

  .skeleton-avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--border-color);
    animation: pulse 1.4s infinite ease-in-out;
  }

  .skeleton-lines {
    display: grid;
    gap: 10px;
  }

  .skeleton-line-title {
    height: 14px;
    width: 45%;
    border-radius: 7px;
    background: var(--border-color);
    animation: pulse 1.4s infinite ease-in-out;
  }

  .skeleton-line-subtitle {
    height: 12px;
    width: 65%;
    border-radius: 6px;
    background: var(--border-color);
    animation: pulse 1.4s infinite ease-in-out;
    opacity: 0.6;
  }

  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.35; }
    100% { opacity: 1; }
  }

  .chat-row {
    display: grid;
    grid-template-columns: 52px 1fr;
    gap: 14px;
    width: 100%;
    height: 72px;
    border: 0;
    border-radius: 0;
    padding: 0 14px;
    color: var(--ink);
    text-align: left;
    background: transparent;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    align-items: center;
    transition: background 0.1s ease;
  }

  .chat-row:active {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }

  .chat-row.selected {
    background: color-mix(in srgb, var(--wa-green) 8%, transparent);
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    color: white;
    font-size: 1.25rem;
    font-weight: 500;
    overflow: hidden;
    flex-shrink: 0;
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
    gap: 2px;
  }

  .chat-row__title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .chat-row__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .chat-row__title strong {
    font-weight: 400;
    font-size: 1.0625rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-row__meta span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  time {
    flex-shrink: 0;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 400;
  }

  .chat-row__meta {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .chat-row__meta span.typing {
    color: var(--wa-green);
    font-weight: 500;
  }

  .chat-row__meta small {
    flex-shrink: 0;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .chat-row__meta b {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 10px;
    color: var(--paper);
    font-size: 0.6875rem;
    font-weight: 700;
    background: var(--wa-green);
    flex-shrink: 0;
  }

  .action-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    align-items: end;
    background: rgba(0, 0, 0, 0.4);
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
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
    border-radius: 20px 20px 0 0;
    padding: 20px 0 max(16px, calc(12px + var(--safe-bottom)));
    background: var(--paper);
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .action-title {
    display: grid;
    gap: 2px;
    margin-bottom: 8px;
    padding: 0 20px;
  }

  .action-title strong {
    color: var(--ink);
    font-size: 1.0625rem;
    font-weight: 500;
  }

  .action-title span {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .action-sheet button {
    min-height: 52px;
    border: 0;
    padding: 0 20px;
    color: var(--ink);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 400;
    text-align: left;
    background: transparent;
    transition: background 0.1s ease;
  }

  .action-sheet button:active {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
</style>
