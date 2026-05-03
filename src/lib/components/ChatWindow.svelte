<script lang="ts">
  import type { ChatMessage, ChatSummary, ContactProfile, GroupMetadataPayload } from '$lib/api/types';
  import { appState, setChatEphemeralDefault } from '$lib/stores/app';
  import { revokeMessage, editMessage, sendReaction, sendChatPresence, markChatRead } from '$lib/api/whatsmo';
  import ChatComposer from './ChatComposer.svelte';
  import Icon from './Icon.svelte';
  import MessageBubble from './MessageBubble.svelte';
  import MessageContextMenu from './MessageContextMenu.svelte';

  export let chat: ChatSummary;
  export let messages: ChatMessage[] = [];
  export let contact: ContactProfile | null = null;
  export let group: GroupMetadataPayload | null = null;
  export let onBack: () => void = () => undefined;
  export let onSend: (chatId: string, text: string, quotedMessage?: ChatMessage) => void;
  export let onRetry: (chatId: string, messageId: string) => void = () => undefined;
  export let onDownloadMedia: (chatId: string, messageId: string) => void = () => undefined;
  export let onAttach: (chatId: string, file: File) => void;

  const MESSAGE_PAGE_SIZE = 50;

  let currentChatId = '';
  let visibleMessageCount = MESSAGE_PAGE_SIZE;
  let selectedMediaMessage: ChatMessage | null = null;
  let imageZoom = 1;
  let infoOpen = false;
  let timerOpen = false;
  let customTimerInput = '';
  let contextMessage: ChatMessage | null = null;
  let replyingTo: ChatMessage | null = null;
  let scrollAnchor: HTMLElement;
  let messageFieldEl: HTMLElement;
  let editingMessage: ChatMessage | null = null;
  let showReactionPicker = false;
  let reactionTarget: ChatMessage | null = null;
  let typingTimeout: number | undefined;

  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  const TIMER_PRESETS = [
    { label: 'Off', seconds: 0 },
    { label: '1 hour', seconds: 3600 },
    { label: '24 hours', seconds: 86400 },
    { label: '7 days', seconds: 604800 },
    { label: '90 days', seconds: 7776000 }
  ];

  $: activeTimer = $appState.chatEphemeralDefaults[chat.id] ?? 0;
  $: activeTimerLabel = activeTimer > 0
    ? TIMER_PRESETS.find((p) => p.seconds === activeTimer)?.label ?? formatDuration(activeTimer)
    : '';

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }

  function setTimer(seconds: number): void {
    setChatEphemeralDefault(chat.id, seconds);
    timerOpen = false;
  }

  function setCustomTimer(): void {
    const value = parseInt(customTimerInput, 10);
    if (!isNaN(value) && value > 0) {
      setChatEphemeralDefault(chat.id, value);
      customTimerInput = '';
      timerOpen = false;
    }
  }

  $: if (chat.id !== currentChatId) {
    currentChatId = chat.id;
    visibleMessageCount = MESSAGE_PAGE_SIZE;
    infoOpen = false;
    setTimeout(scrollToBottom, 50);
  }

  function scrollToBottom(): void {
    scrollAnchor?.scrollIntoView({ behavior: 'smooth' });
  }

  function scrollToTop(): void {
    messageFieldEl?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $: hiddenMessageCount = Math.max(messages.length - visibleMessageCount, 0);
  $: visibleMessages = messages.slice(Math.max(messages.length - visibleMessageCount, 0));

  function loadOlderMessages(): void {
    visibleMessageCount = Math.min(messages.length, visibleMessageCount + MESSAGE_PAGE_SIZE);
  }

  function openMedia(message: ChatMessage): void {
    if (!message.media) return;
    selectedMediaMessage = message;
    imageZoom = 1;
  }

  function closeMedia(): void {
    selectedMediaMessage = null;
    imageZoom = 1;
  }

  function handleMediaGridClick(message: ChatMessage): void {
    if (!message.media) return;
    if (message.media.cachedDataUrl || message.media.previewUrl || message.media.kind === 'document') {
      openMedia(message);
      return;
    }

    onDownloadMedia(chat.id, message.id);
  }

  $: groupMetaLabel = chat.kind === 'group'
    ? `${chat.participantCount ?? 0} participants${chat.groupAdminCount ? ` · ${chat.groupAdminCount} admins` : ''}${chat.groupIsAnnouncement ? ' · announcement' : ''}`
    : 'online';
  $: viewerTitle = selectedMediaMessage?.media
    ? selectedMediaMessage.media.kind === 'document'
      ? selectedMediaMessage.media.name
      : selectedMediaMessage.media.kind === 'video'
        ? 'Video'
        : selectedMediaMessage.media.kind === 'audio'
          ? selectedMediaMessage.media.ptt ? 'Voice message' : 'Audio'
          : selectedMediaMessage.media.kind === 'sticker'
            ? 'Sticker'
            : 'Image'
    : '';
  $: mediaMessages = messages.filter((message) => message.media && !message.deleted);
  $: profileRows = chat.kind === 'group'
    ? [
        ['Participants', String(group?.participantCount ?? chat.participantCount ?? 0)],
        ['Admins', String(group?.adminCount ?? chat.groupAdminCount ?? 0)],
        ['Mode', group?.isAnnouncement || chat.groupIsAnnouncement ? 'Announcement' : 'Conversation'],
        ['Locked', group?.isLocked || chat.groupIsLocked ? 'Yes' : 'No'],
        ...(group?.creator ? [['Creator', group.creator]] : []),
        ...(group?.createdAtMs ? [['Created', new Date(group.createdAtMs).toLocaleDateString()]] : [])
      ]
    : [
        ['Phone', contact?.phone ?? chat.id.split('@')[0]],
        ['About', contact?.about ?? chat.subtitle],
        ['Account', contact?.isBusiness ? 'Business' : 'Personal'],
        ...(contact?.lid ? [['LID', contact.lid]] : []),
        ...(contact?.profileUpdatedAt ? [['Updated', new Date(contact.profileUpdatedAt).toLocaleDateString()]] : [])
      ];
  $: participantRows = group?.participants ?? [];

  function participantLabel(participant: { id: string; phoneNumber?: string }): string {
    if (participant.phoneNumber) return `+${participant.phoneNumber}`;
    const user = participant.id.split('@')[0]?.split(':')[0] ?? participant.id;
    return /^\d+$/.test(user) ? `+${user}` : user.includes('@lid') ? 'Unknown contact' : user;
  }

  function openContextMenu(message: ChatMessage): void {
    contextMessage = message;
  }

  function closeContextMenu(): void {
    contextMessage = null;
  }

  async function handleCopyText(): Promise<void> {
    if (contextMessage?.text) {
      await navigator.clipboard.writeText(contextMessage.text);
    }
    closeContextMenu();
  }

  function handleReply(): void {
    if (contextMessage) replyingTo = contextMessage;
    closeContextMenu();
  }

  function cancelReply(): void {
    replyingTo = null;
  }

  function handleReact(): void {
    if (contextMessage) {
      reactionTarget = contextMessage;
      showReactionPicker = true;
    }
    closeContextMenu();
  }

  async function pickReaction(emoji: string): Promise<void> {
    if (reactionTarget) {
      await sendReaction(chat.id, reactionTarget.id, reactionTarget.senderId, emoji);
    }
    showReactionPicker = false;
    reactionTarget = null;
  }

  async function handleDelete(): Promise<void> {
    if (contextMessage?.fromMe) {
      await revokeMessage(chat.id, contextMessage.id);
    }
    closeContextMenu();
  }

  function handleEdit(): void {
    if (contextMessage?.fromMe && contextMessage.text) {
      editingMessage = contextMessage;
    }
    closeContextMenu();
  }

  function cancelEdit(): void {
    editingMessage = null;
  }

  function handleTyping(): void {
    void sendChatPresence(chat.id, true);
    window.clearTimeout(typingTimeout);
    typingTimeout = window.setTimeout(() => {
      void sendChatPresence(chat.id, false);
    }, 3000);
  }

  $: if (chat.id !== currentChatId) {
    void markChatRead(chat.id);
  }
</script>

<section class="chat-window" aria-label="Conversation">
  <header>
    <button class="back" aria-label="Back to chats" on:click={onBack}><Icon name="arrow-back" size="24px" /></button>
    <div class:has-image={Boolean(chat.avatarUrl)} class="avatar" style={`background: ${chat.avatarGradient}`}>
      {#if chat.avatarUrl}
        <img src={chat.avatarUrl} alt="" loading="lazy" referrerpolicy="no-referrer" />
      {:else}
        {chat.title.slice(0, 1)}
      {/if}
    </div>
    <div class="header-text">
      <h2>{chat.title}</h2>
      <p>{chat.typing ?? groupMetaLabel}</p>
    </div>
    <button class="icon" class:timer-active={activeTimer > 0} aria-label="Disappearing messages" on:click={() => (timerOpen = !timerOpen)}>
      <Icon name="timer" />
      {#if activeTimer > 0}
        <span class="timer-badge">{activeTimerLabel}</span>
      {/if}
    </button>
    <button class="icon" aria-label="Chat info" on:click={() => (infoOpen = true)}><Icon name="more" /></button>
  </header>

  <div class="message-field" bind:this={messageFieldEl}>
    {#if hiddenMessageCount > 0}
      <button class="load-older" on:click={loadOlderMessages}>
        Load {Math.min(hiddenMessageCount, MESSAGE_PAGE_SIZE)} older messages
      </button>
    {/if}
    <div class="day-chip">Today</div>
    {#each visibleMessages as message, i (message.id)}
      {@const prevMessage = visibleMessages[i - 1]}
      {@const isNewSender = !prevMessage || prevMessage.senderId !== message.senderId || prevMessage.fromMe !== message.fromMe}
      <div class:sender-gap={isNewSender && i > 0} class="msg-wrap">
        <MessageBubble
          {message}
          showSenderName={chat.kind === 'group' && !message.fromMe && isNewSender}
          onRetry={() => onRetry(chat.id, message.id)}
          onDownloadMedia={() => onDownloadMedia(chat.id, message.id)}
          onOpenMedia={openMedia}
          onLongPress={openContextMenu}
          onSwipeReply={(msg) => { replyingTo = msg; }}
        />
      </div>
    {/each}
    <div bind:this={scrollAnchor}></div>
  </div>

  <div class="scroll-buttons">
    <button aria-label="Scroll to top" on:click={scrollToTop}><Icon name="keyboard_arrow_up" /></button>
    <button aria-label="Scroll to bottom" on:click={scrollToBottom}><Icon name="keyboard_arrow_down" /></button>
  </div>

  {#if replyingTo}
    <div class="reply-bar">
      <div class="reply-preview">
        <strong>{replyingTo.senderName ?? 'Message'}</strong>
        <span>{replyingTo.text ?? 'Media'}</span>
      </div>
      <button aria-label="Cancel reply" on:click={cancelReply}><Icon name="close" size="20px" /></button>
    </div>
  {/if}

  {#if editingMessage}
    <div class="reply-bar edit-bar">
      <div class="reply-preview">
        <strong>Editing</strong>
        <span>{editingMessage.text}</span>
      </div>
      <button aria-label="Cancel edit" on:click={cancelEdit}><Icon name="close" size="20px" /></button>
    </div>
  {/if}

  <ChatComposer
    on:send={(event) => {
      if (editingMessage) {
        void editMessage(chat.id, editingMessage.id, event.detail);
        editingMessage = null;
      } else {
        onSend(chat.id, event.detail, replyingTo ?? undefined);
        replyingTo = null;
      }
    }}
    on:attach={(event) => onAttach(chat.id, event.detail)}
    on:typing={handleTyping}
  />

  {#if timerOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="timer-overlay" on:click={() => (timerOpen = false)}>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="timer-sheet" on:click|stopPropagation>
        <div class="timer-handle"></div>
        <h3>Disappearing messages</h3>
        <p class="timer-hint">Messages will auto-delete after the selected duration.</p>
        <div class="timer-grid">
          {#each TIMER_PRESETS as preset}
            <button
              class="timer-preset"
              class:active={activeTimer === preset.seconds}
              on:click={() => setTimer(preset.seconds)}
            >
              {preset.label}
            </button>
          {/each}
        </div>
        <div class="timer-custom">
          <input
            type="number"
            bind:value={customTimerInput}
            placeholder="Custom (seconds)"
            min="1"
          />
          <button class="timer-set-btn" on:click={setCustomTimer}>Set</button>
        </div>
      </div>
    </div>
  {/if}

  {#if infoOpen}
    <aside class="chat-info" aria-label="Chat info">
      <header>
        <button aria-label="Close chat info" on:click={() => (infoOpen = false)}><Icon name="arrow-back" size="24px" /></button>
        <strong>Chat info</strong>
      </header>

      <section class="profile-block">
        <div class:has-image={Boolean(chat.avatarUrl)} class="profile-avatar" style={`background: ${chat.avatarGradient}`}>
          {#if chat.avatarUrl}
            <img src={chat.avatarUrl} alt="" loading="lazy" referrerpolicy="no-referrer" />
          {:else}
            {chat.title.slice(0, 1)}
          {/if}
        </div>
        <h3>{chat.title}</h3>
        <p>{chat.kind === 'group' ? groupMetaLabel : chat.subtitle}</p>
        {#if chat.kind === 'group' && (group?.description || chat.groupDescription)}
          <small>{group?.description ?? chat.groupDescription}</small>
        {:else if chat.kind === 'direct' && contact?.about}
          <small>{contact.about}</small>
        {/if}
      </section>

      <section class="details-section" aria-label="Profile details">
        {#each profileRows as row}
          <div>
            <span>{row[0]}</span>
            <strong>{row[1]}</strong>
          </div>
        {/each}
      </section>

      {#if chat.kind === 'group'}
        <section class="participants-section" aria-label="Group participants">
          <div class="section-title">
            <strong>Participants</strong>
            <span>{participantRows.length}</span>
          </div>
          {#if participantRows.length === 0}
            <p class="empty-media">Participant list has not synced yet.</p>
          {:else}
            <div class="participant-list">
              {#each participantRows as participant (participant.id)}
                <div>
                  <span>{participantLabel(participant)}</span>
                  {#if participant.isAdmin}
                    <small>Admin</small>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <section class="media-section">
        <div class="section-title">
          <strong>Media</strong>
          <span>{mediaMessages.length}</span>
        </div>

        {#if mediaMessages.length === 0}
          <p class="empty-media">No media in this chat yet.</p>
        {:else}
          <div class="media-grid">
            {#each mediaMessages as message (message.id)}
              <button class="media-tile" type="button" on:click={() => handleMediaGridClick(message)}>
                {#if message.media?.previewUrl || message.media?.cachedDataUrl}
                  {#if message.media.kind === 'video'}
                    <video src={message.media.cachedDataUrl ?? message.media.previewUrl} muted playsinline preload="metadata">
                      <track kind="captions" />
                    </video>
                  {:else}
                    <img src={message.media.cachedDataUrl ?? message.media.previewUrl} alt={message.media.name} />
                  {/if}
                {:else}
                  <span>{message.media?.kind === 'document' ? 'DOC' : message.media?.kind.toUpperCase()}</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </section>
    </aside>
  {/if}

  {#if selectedMediaMessage?.media}
    <div class="media-viewer" role="dialog" aria-modal="true" aria-label={selectedMediaMessage.media.name}>
      <header>
        <strong>{viewerTitle}</strong>
        <button aria-label="Close media viewer" on:click={closeMedia}>×</button>
      </header>

      <div class="media-viewer__body">
        {#if selectedMediaMessage.media.kind === 'image' && (selectedMediaMessage.media.cachedDataUrl || selectedMediaMessage.media.previewUrl)}
          <img
            src={selectedMediaMessage.media.cachedDataUrl ?? selectedMediaMessage.media.previewUrl}
            alt={selectedMediaMessage.media.name}
            style={`transform: scale(${imageZoom})`}
          />
        {:else if selectedMediaMessage.media.kind === 'video' && selectedMediaMessage.media.cachedDataUrl}
          <video src={selectedMediaMessage.media.cachedDataUrl} controls autoplay playsinline>
            <track kind="captions" />
          </video>
        {:else if selectedMediaMessage.media.kind === 'sticker' && (selectedMediaMessage.media.cachedDataUrl || selectedMediaMessage.media.previewUrl)}
          <img src={selectedMediaMessage.media.cachedDataUrl ?? selectedMediaMessage.media.previewUrl} alt="Sticker" />
        {:else if selectedMediaMessage.media.kind === 'audio' && selectedMediaMessage.media.cachedDataUrl}
          <audio src={selectedMediaMessage.media.cachedDataUrl} controls autoplay></audio>
        {:else if selectedMediaMessage.media.cachedDataUrl}
          <a class="document-open" href={selectedMediaMessage.media.cachedDataUrl} download={selectedMediaMessage.media.name}>
            Open {selectedMediaMessage.media.name}
          </a>
        {:else}
          <p>Download the media first to preview it here.</p>
        {/if}
      </div>

      {#if selectedMediaMessage.media.kind === 'image'}
        <footer>
          <button on:click={() => (imageZoom = Math.max(1, imageZoom - 0.25))}>−</button>
          <span>{Math.round(imageZoom * 100)}%</span>
          <button on:click={() => (imageZoom = Math.min(3, imageZoom + 0.25))}>+</button>
        </footer>
      {/if}
    </div>
  {/if}

  {#if contextMessage}
    <MessageContextMenu
      message={contextMessage}
      visible={true}
      on:reply={handleReply}
      on:react={handleReact}
      on:copy={handleCopyText}
      on:edit={handleEdit}
      on:delete={handleDelete}
      on:forward={() => { closeContextMenu(); }}
      on:close={closeContextMenu}
    />
  {/if}

  {#if showReactionPicker}
    <div class="reaction-picker">
      <button class="reaction-dismiss" aria-label="Close reactions" on:click={() => { showReactionPicker = false; reactionTarget = null; }}></button>
      <div class="reaction-row">
        {#each QUICK_REACTIONS as emoji}
          <button on:click={() => pickReaction(emoji)}>{emoji}</button>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .chat-window {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr auto;
    width: 100%;
    height: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background-color: var(--app-bg);
  }

  header {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    padding: calc(10px + var(--safe-top, 0px)) 12px 10px 4px;
    color: var(--ink);
    background: var(--paper);
    border-bottom: 1px solid var(--border-color);
    width: 100%;
    min-width: 0;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    color: white;
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

  .header-text {
    min-width: 0;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--ink);
    font-size: 1.1rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  header p {
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  header button {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    color: var(--ink);
    background: transparent;
    cursor: pointer;
  }

  .back {
    width: 40px;
    height: 40px;
    margin-right: -4px;
  }

  .icon {
    width: 40px;
    height: 40px;
    font-size: 1.25rem;
  }

  .message-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 2px;
    min-width: 0;
    min-height: 0;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 16px 12px;
  }

  .msg-wrap.sender-gap {
    padding-top: 10px;
  }

  .scroll-buttons {
    position: absolute;
    right: 12px;
    bottom: 72px;
    z-index: 6;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .scroll-buttons button {
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 999px;
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    display: grid;
    place-items: center;
  }

  .day-chip {
    justify-self: center;
    padding: 6px 12px;
    border-radius: 8px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--paper);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
    margin: 8px 0;
  }

  .load-older {
    justify-self: center;
    min-height: 34px;
    border: 0;
    border-radius: 8px;
    padding: 0 16px;
    color: var(--wa-green-dark);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 500;
    background: var(--paper);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
    cursor: pointer;
    margin-bottom: 8px;
  }

  .chat-info {
    position: absolute;
    inset: 0;
    z-index: 24;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    color: var(--ink);
    background: var(--app-bg);
  }

  .chat-info header {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: calc(12px + var(--safe-top, 0px)) 16px 12px;
    border-bottom: 1px solid var(--border-color);
    background: var(--paper);
    flex-shrink: 0;
  }

  .chat-info header strong {
    font-size: 1.25rem;
    font-weight: 500;
  }

  .chat-info header button {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    color: var(--ink);
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .profile-block {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 24px 16px 20px;
    text-align: center;
    border-bottom: 8px solid var(--app-bg);
    background: var(--paper);
    flex-shrink: 0;
  }

  .profile-avatar {
    display: grid;
    place-items: center;
    width: 140px;
    height: 140px;
    border-radius: 50%;
    overflow: hidden;
    color: white;
    font-size: 3rem;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .profile-avatar.has-image {
    background: var(--border-color) !important;
  }

  .profile-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .profile-block h3,
  .profile-block p,
  .profile-block small {
    margin: 0;
  }

  .profile-block h3 {
    font-size: 1.4rem;
    font-weight: 400;
  }

  .profile-block p {
    font-size: 1rem;
    color: var(--muted);
  }

  .profile-block small,
  .empty-media {
    color: var(--muted);
  }

  .details-section {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    border-bottom: 8px solid var(--app-bg);
    background: var(--paper);
    flex-shrink: 0;
  }

  .details-section div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 24px;
    background: transparent;
  }

  .details-section span {
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 400;
  }

  .details-section strong {
    overflow-wrap: anywhere;
    color: var(--ink);
    font-size: 1.05rem;
    font-weight: 400;
  }

  .media-section {
    display: grid;
    align-content: start;
    gap: 16px;
    padding: 16px 16px 24px;
    border-bottom: 8px solid var(--app-bg);
    background: var(--paper);
    flex-shrink: 0;
  }

  .participants-section {
    display: grid;
    gap: 12px;
    padding: 16px;
    border-bottom: 8px solid var(--app-bg);
    background: var(--paper);
    flex-shrink: 0;
  }

  .participant-list {
    display: grid;
    gap: 8px;
    max-height: 220px;
    overflow-y: auto;
  }

  .participant-list div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 42px;
    padding: 8px 10px;
    border-radius: 14px;
    background: var(--nav-active, #eef2ee);
  }

  .participant-list span {
    overflow: hidden;
    color: var(--ink, #101f1b);
    font-size: 0.88rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .participant-list small {
    flex: 0 0 auto;
    border-radius: 999px;
    padding: 4px 8px;
    color: var(--wa-green-dark, #075e54);
    font-size: 0.72rem;
    font-weight: 950;
    background: color-mix(in srgb, var(--wa-green, #25d366) 18%, transparent);
  }

  .section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--ink);
  }

  .section-title strong {
    font-size: 0.95rem;
    font-weight: 500;
  }

  .section-title span {
    color: var(--muted);
    font-size: 0.875rem;
  }

  .media-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }

  .media-tile {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border: 0;
    border-radius: 8px;
    overflow: hidden;
    color: white;
    font: inherit;
    font-weight: 600;
    background: var(--border-color);
    cursor: pointer;
  }

  .media-tile img,
  .media-tile video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .media-tile span {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--wa-green-dark);
    font-size: 0.8rem;
    font-weight: 500;
  }

  .media-viewer {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: grid;
    grid-template-rows: auto 1fr auto;
    color: #f7fff6;
    background: rgba(0, 0, 0, 0.94);
  }

  .media-viewer header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    padding: calc(12px + var(--safe-top, 0px)) 14px 12px;
    background: rgba(0, 0, 0, 0.32);
    border: 0;
  }

  .media-viewer header strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .media-viewer header button,
  .media-viewer footer button {
    border: 0;
    border-radius: 999px;
    color: #f7fff6;
    background: rgba(255, 255, 255, 0.14);
  }

  .media-viewer header button {
    width: 38px;
    height: 38px;
    font-size: 1.4rem;
  }

  .media-viewer__body {
    display: grid;
    place-items: center;
    min-height: 0;
    overflow: auto;
    padding: 16px;
  }

  .media-viewer__body img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: transform 160ms ease;
  }

  .media-viewer__body video {
    width: 100%;
    max-height: 100%;
  }

  .document-open {
    color: #d9fdd3;
    font-weight: 900;
  }

  .media-viewer footer {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
    padding: 12px 16px max(14px, var(--safe-bottom, 0px));
  }

  .media-viewer footer button {
    width: 42px;
    height: 42px;
    font-size: 1.4rem;
  }

  /* ─── Timer Picker ─── */
  .timer-active {
    color: var(--wa-green-dark) !important;
    position: relative;
  }

  .timer-badge {
    position: absolute;
    bottom: 2px;
    right: -2px;
    font-size: 0.55rem;
    font-weight: 800;
    background: var(--wa-green-dark);
    color: white;
    padding: 1px 4px;
    border-radius: 6px;
    line-height: 1.2;
  }

  .timer-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }

  .timer-sheet {
    width: 100%;
    max-width: 440px;
    padding: 16px 20px 24px;
    background: var(--paper);
    border-radius: 24px 24px 0 0;
    animation: slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .timer-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-color);
    margin: 0 auto 16px;
  }

  .timer-sheet h3 {
    margin: 0 0 4px;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--ink);
  }

  .timer-hint {
    margin: 0 0 16px;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .timer-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }

  .timer-preset {
    padding: 10px 16px;
    border: 1px solid var(--border-color);
    border-radius: 20px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .timer-preset:hover {
    background: var(--nav-active);
  }

  .timer-preset.active {
    background: var(--wa-green-dark);
    color: white;
    border-color: var(--wa-green-dark);
  }

  .timer-custom {
    display: flex;
    gap: 8px;
  }

  .timer-custom input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    font: inherit;
    font-size: 0.9rem;
    color: var(--ink);
    background: transparent;
    outline: none;
  }

  .timer-custom input:focus {
    border-color: var(--wa-green-dark);
  }

  .timer-set-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 12px;
    background: var(--wa-green-dark);
    color: white;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .reply-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-left: 3px solid var(--wa-green);
    margin: 0 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--wa-green) 10%, var(--paper));
  }

  .reply-bar.edit-bar {
    border-left-color: #f59e0b;
  }

  .reply-preview {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .reply-preview strong {
    font-size: 0.82rem;
    color: var(--wa-green-dark);
  }

  .edit-bar .reply-preview strong {
    color: #f59e0b;
  }

  .reply-preview span {
    font-size: 0.84rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reply-bar button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 999px;
    color: var(--muted);
    background: transparent;
    flex-shrink: 0;
  }

  .reaction-picker {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.3);
  }

  .reaction-dismiss {
    position: absolute;
    inset: 0;
    border: 0;
    background: transparent;
  }

  .reaction-row {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 999px;
    background: var(--paper);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
  }

  .reaction-row button {
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 999px;
    font-size: 1.5rem;
    background: transparent;
  }

  .reaction-row button:active {
    background: var(--nav-active);
    transform: scale(1.2);
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
