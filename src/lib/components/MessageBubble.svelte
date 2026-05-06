<script lang="ts">
  import type { ChatMessage } from '$lib/api/types';
  import Icon from './Icon.svelte';

  export let message: ChatMessage;
  export let showSenderName = false;
  export let isGroupContinuation = false;
  export let senderAvatarUrl: string | undefined = undefined;
  export let senderAvatarGradient: string | undefined = undefined;
  export let onRetry: (message: ChatMessage) => void = () => undefined;
  export let onDownloadMedia: (message: ChatMessage) => void = () => undefined;
  export let onOpenMedia: (message: ChatMessage) => void = () => undefined;
  export let onLongPress: (message: ChatMessage) => void = () => undefined;
  export let onSwipeReply: (message: ChatMessage) => void = () => undefined;
  export let onScrollToMessage: (messageId: string) => void = () => undefined;

  const LONG_PRESS_MS = 420;
  const SWIPE_THRESHOLD = 90;
  let longPressTimer: number | undefined;
  let suppressClick = false;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeOffsetX = 0;
  let isSwiping = false;
  let swipeLocked = false;
  let bubbleEl: HTMLElement;

  function startLongPress(): void {
    window.clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      suppressClick = true;
      onLongPress(message);
    }, LONG_PRESS_MS);
  }

  function cancelLongPress(): void {
    window.clearTimeout(longPressTimer);
  }

  function handleTouchStart(event: TouchEvent): void {
    swipeStartX = event.touches[0].clientX;
    swipeStartY = event.touches[0].clientY;
    swipeOffsetX = 0;
    isSwiping = false;
    swipeLocked = false;
  }

  function handleTouchMove(event: TouchEvent): void {
    if (swipeLocked) return;
    const dx = event.touches[0].clientX - swipeStartX;
    const dy = Math.abs(event.touches[0].clientY - swipeStartY);

    if (!isSwiping && dy > 20) {
      swipeLocked = true;
      return;
    }

    if (dx > 20) {
      isSwiping = true;
      cancelLongPress();
      swipeOffsetX = Math.min(dx, 110);
      if (bubbleEl) bubbleEl.style.transform = `translateX(${swipeOffsetX}px)`;
    }
  }

  function handleTouchEnd(): void {
    if (isSwiping && swipeOffsetX >= SWIPE_THRESHOLD) {
      onSwipeReply(message);
    }
    isSwiping = false;
    swipeLocked = false;
    swipeOffsetX = 0;
    if (bubbleEl) bubbleEl.style.transform = '';
  }

  const formatter = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });

  $: tickIcon = message.status === 'failed' ? 'error_outline' : message.status === 'queued' ? 'schedule' : message.status === 'sent' ? 'check' : 'done_all';
  $: canRetry = message.fromMe && message.status === 'failed' && Boolean(message.text) && !message.deleted;
  $: canDownload = Boolean(message.media && !message.media.cachedDataUrl && message.media.directPath);
  $: mediaSource = message.media?.cachedDataUrl ?? message.media?.previewUrl;
  $: isPreviewOnly = Boolean(message.media?.previewUrl && !message.media.cachedDataUrl && !message.fromMe);
  $: isVisualMedia = message.media?.kind === 'image' || message.media?.kind === 'video' || message.media?.kind === 'sticker';
  $: isSticker = message.media?.kind === 'sticker';
  $: canOpenMedia = Boolean(message.media && (message.media.cachedDataUrl || (message.fromMe && isVisualMedia && mediaSource)));

  function handleMediaClick(): void {
    if (canOpenMedia) {
      onOpenMedia(message);
    } else if (canDownload) {
      onDownloadMedia(message);
    }
  }

  function groupedReactions(reactions: Array<{ emoji: string; senderId: string }>): Array<{ emoji: string; count: number }> {
    const map = new Map<string, number>();
    for (const r of reactions) {
      map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([emoji, count]) => ({ emoji, count }));
  }
</script>

<div class:bubble-row={showSenderName && !message.fromMe && senderAvatarGradient} class:group-continuation={isGroupContinuation}>
  {#if showSenderName && !message.fromMe && senderAvatarGradient}
    <div class="sender-avatar" style={`background: ${senderAvatarGradient}`}>
      {#if senderAvatarUrl}
        <img src={senderAvatarUrl} alt="" referrerpolicy="no-referrer" />
      {:else}
        {(message.senderName ?? '?').slice(0, 1)}
      {/if}
    </div>
  {/if}
<article
  bind:this={bubbleEl}
  class:mine={message.fromMe}
  class:sticker={isSticker}
  class="bubble"
  on:pointerdown={startLongPress}
  on:pointerup={cancelLongPress}
  on:pointerleave={cancelLongPress}
  on:pointercancel={cancelLongPress}
  on:contextmenu|preventDefault={() => onLongPress(message)}
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
>
  {#if showSenderName && message.senderName}
    <p class="sender-name">{message.senderName}</p>
  {/if}
  {#if message.quotedMessageId && (message.quotedText || message.quotedSenderName || message.quotedMediaKind)}
    <button class="quoted-preview" type="button" on:click|stopPropagation={() => onScrollToMessage(message.quotedMessageId ?? '')}>
      <div class="quoted-bar"></div>
      <div class="quoted-content">
        {#if message.quotedSenderName}
          <strong class="quoted-sender">{message.quotedSenderName}</strong>
        {/if}
        {#if message.quotedMediaKind && !message.quotedText}
          <p class="quoted-text quoted-media-label">
            <Icon name={message.quotedMediaKind === 'image' ? 'photo_camera' : message.quotedMediaKind === 'video' ? 'videocam' : message.quotedMediaKind === 'audio' ? 'mic' : message.quotedMediaKind === 'sticker' ? 'emoji_emotions' : 'insert_drive_file'} size="14px" />
            {message.quotedMediaKind === 'image' ? 'Photo' : message.quotedMediaKind === 'video' ? 'Video' : message.quotedMediaKind === 'audio' ? 'Audio' : message.quotedMediaKind === 'sticker' ? 'Sticker' : 'Document'}
          </p>
        {:else}
          <p class="quoted-text">
            {#if message.quotedMediaKind}
              <Icon name={message.quotedMediaKind === 'image' ? 'photo_camera' : message.quotedMediaKind === 'video' ? 'videocam' : message.quotedMediaKind === 'audio' ? 'mic' : 'insert_drive_file'} size="14px" />
            {/if}
            {message.quotedText ?? 'Message'}
          </p>
        {/if}
      </div>
      {#if message.quotedMediaPreviewUrl}
        <img class="quoted-thumb" src={message.quotedMediaPreviewUrl} alt="" />
      {/if}
    </button>
  {/if}
  {#if message.deleted && !message.deletedBySender}
    <p class="deleted">{message.text ?? 'This message was deleted.'}</p>
  {:else if message.deletedBySender}
    <div class="anti-delete-badge">
      <Icon name="delete" size="14px" />
      <span>Deleted by sender</span>
    </div>
    {#if message.media}
      <!-- show the preserved media -->
    {/if}
    {#if message.text}
      <p>{message.text}</p>
    {/if}
  {:else if message.media}
    <button
      class:has-preview={Boolean(mediaSource)}
      class:preview-only={isPreviewOnly}
      class:visual-media={isVisualMedia}
      class="media-card"
      type="button"
      on:click={handleMediaClick}
    >
      {#if isVisualMedia}
        <div class="visual-frame">
          {#if mediaSource && message.media.kind === 'image'}
            <img src={mediaSource} alt={message.media.name} />
          {:else if mediaSource && message.media.kind === 'video'}
            <video src={mediaSource} muted playsinline preload="metadata">
              <track kind="captions" />
            </video>
          {:else if mediaSource && message.media.kind === 'sticker'}
            <img class="sticker-image" src={mediaSource} alt="Sticker" />
          {:else}
            <div class="empty-visual"></div>
          {/if}

          {#if canDownload}
            <div class="download-overlay" aria-hidden="true">
              <div class="download-circle">
                <svg viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" />
                  <circle cx="24" cy="24" r="20" fill="none" stroke="white" stroke-width="2.5" stroke-dasharray="126" stroke-dashoffset="126" stroke-linecap="round" />
                </svg>
                <Icon name="download" size="20px" />
              </div>
              {#if message.media?.fileLength}
                <span class="download-size">{(message.media.fileLength / (1024 * 1024)).toFixed(1)} MB</span>
              {/if}
            </div>
          {/if}
        </div>
      {:else if message.media.kind === 'audio'}
        <div class="audio-player" class:ptt={message.media.ptt}>
          <button class="audio-play-btn" type="button" aria-label="Play">
            <Icon name={message.media.cachedDataUrl ? 'play_arrow' : 'download'} size="22px" />
          </button>
          <div class="audio-track">
            <div class="audio-waveform">
              {#each Array(28) as _, i}
                <span style="height: {12 + Math.sin(i * 0.7) * 8 + Math.random() * 6}px"></span>
              {/each}
            </div>
            <div class="audio-meta">
              <span class="audio-duration">{message.media.ptt ? '0:23' : 'Audio'}</span>
              {#if !message.media.cachedDataUrl && canDownload}
                <span class="audio-size">Download</span>
              {/if}
            </div>
          </div>
          {#if message.media.cachedDataUrl}
            <audio src={message.media.cachedDataUrl} class="audio-hidden"></audio>
          {/if}
        </div>
      {:else}
        <div class="file-tile">
          <span><Icon name="insert_drive_file" size="24px" /></span>
          <strong>{message.media.name}</strong>
          <small>{canDownload ? 'Download to preview' : message.status === 'queued' ? 'Sending…' : 'Attachment'}</small>
        </div>
      {/if}
      {#if mediaSource && message.media.kind === 'document'}
        <strong class="media-name">{message.media.name}</strong>
      {/if}
    </button>
  {/if}
  {#if message.text && !message.deleted && !message.deletedBySender}
    <p>{message.text}</p>
  {/if}
  {#if message.editHistory && message.editHistory.length > 0}
    <details class="edit-history">
      <summary><Icon name="history" size="14px" /> {message.editHistory.length} earlier version{message.editHistory.length > 1 ? 's' : ''}</summary>
      <ul>
        {#each message.editHistory as oldText, i}
          <li><span class="edit-index">v{i + 1}</span> {oldText}</li>
        {/each}
      </ul>
    </details>
  {/if}
  <footer>
    <time>{formatter.format(message.timestamp)}</time>
    {#if message.edited && !message.deleted}
      <em>edited</em>
    {/if}
    {#if message.deletedBySender}
      <em class="power-tag">kept</em>
    {/if}
    {#if message.fromMe}
      <span class="status-tick" class:read={message.status === 'read'}>
        <Icon name={tickIcon} size="18px" />
      </span>
    {/if}
  </footer>
  {#if canRetry}
    <button class="retry-button" on:click={() => onRetry(message)}>Retry</button>
  {/if}
  {#if message.reactions && message.reactions.length > 0}
    <div class="reaction-chips">
      {#each groupedReactions(message.reactions) as reaction}
        <span class="reaction-chip">{reaction.emoji} {reaction.count > 1 ? reaction.count : ''}</span>
      {/each}
    </div>
  {/if}
</article>
</div>

<style>
  .bubble {
    justify-self: start;
    max-width: 82%;
    padding: 6px 8px 6px;
    border-radius: 0 8px 8px 8px;
    color: var(--ink);
    background: var(--message-in);
    box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.08);
    animation: rise 140ms ease both;
    word-wrap: break-word;
    overflow-wrap: break-word;
    position: relative;
    margin-left: 8px;
    transition: transform 160ms ease;
    touch-action: pan-y;
  }

  .bubble::before {
    content: "";
    position: absolute;
    top: 0;
    left: -8px;
    width: 8px;
    height: 13px;
    background: var(--message-in);
    -webkit-mask: url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%208%2013%22%3E%3Cpath%20d%3D%22M8%200H1.5C.2%200-.4%201.2.6%202.6L8%2011.2V0z%22%2F%3E%3C%2Fsvg%3E') no-repeat;
    mask: url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%208%2013%22%3E%3Cpath%20d%3D%22M8%200H1.5C.2%200-.4%201.2.6%202.6L8%2011.2V0z%22%2F%3E%3C%2Fsvg%3E') no-repeat;
  }

  .bubble.mine {
    justify-self: end;
    border-radius: 8px 0 8px 8px;
    background: var(--message-out);
    margin-left: 0;
    margin-right: 8px;
  }

  .bubble.mine::before {
    left: auto;
    right: -8px;
    background: var(--message-out);
    -webkit-mask: url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%208%2013%22%3E%3Cpath%20d%3D%22M0%200h6.5c1.3%200%201.9%201.2.9%202.6L0%2011.2V0z%22%2F%3E%3C%2Fsvg%3E') no-repeat;
    mask: url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%208%2013%22%3E%3Cpath%20d%3D%22M0%200h6.5c1.3%200%201.9%201.2.9%202.6L0%2011.2V0z%22%2F%3E%3C%2Fsvg%3E') no-repeat;
  }

  .bubble.sticker {
    background: transparent;
    box-shadow: none;
    padding: 0;
    margin-left: 8px;
    margin-right: 0;
  }

  .bubble.sticker.mine {
    margin-left: 0;
    margin-right: 8px;
  }

  .bubble.sticker::before {
    display: none;
  }

  .bubble.sticker .media-card {
    background: transparent;
    min-height: auto;
    width: 160px;
  }

  .bubble.sticker .media-card.visual-media {
    min-height: auto;
  }

  .bubble.sticker .visual-frame {
    background: transparent;
    min-height: auto;
  }

  p {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.35;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    margin-top: 1px;
    margin-bottom: -2px;
    color: var(--muted);
    font-size: 0.6875rem;
    font-weight: 400;
  }

  .status-tick {
    display: flex;
    align-items: center;
    margin-left: 2px;
    margin-bottom: -1px;
  }

  .status-tick.read {
    color: #53bdeb;
  }

  footer em {
    font-style: normal;
  }

  .deleted {
    color: var(--muted);
    font-style: italic;
  }

  .anti-delete-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 8px;
    background: rgba(234, 67, 53, 0.1);
    color: #ea4335;
    font-size: 0.72rem;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .power-tag {
    font-style: normal;
    color: var(--wa-green-dark);
    font-size: 0.7rem;
    font-weight: 600;
  }

  .edit-history {
    margin-top: 4px;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .edit-history summary {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 500;
    color: var(--wa-green-dark);
  }

  .edit-history ul {
    margin: 4px 0 0;
    padding: 0 0 0 16px;
    list-style: none;
  }

  .edit-history li {
    padding: 2px 0;
    border-bottom: 1px dashed var(--border-color);
    color: var(--ink);
  }

  .edit-index {
    color: var(--muted);
    font-weight: 600;
    margin-right: 4px;
  }

  .group-continuation {
    padding-left: 36px;
  }

  .bubble-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .sender-avatar {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
    overflow: hidden;
    margin-top: 2px;
  }

  .sender-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .sender-name {
    margin-bottom: 2px;
    color: var(--wa-green-dark);
    font-size: 0.8rem;
    font-weight: 500;
  }

  .quoted-preview {
    display: flex;
    width: 100%;
    margin-bottom: 4px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    color: inherit;
    font: inherit;
    text-align: left;
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    overflow: hidden;
    cursor: pointer;
  }

  .quoted-preview:active {
    background: color-mix(in srgb, var(--ink) 10%, transparent);
  }

  .quoted-bar {
    width: 4px;
    flex-shrink: 0;
    border-radius: 4px 0 0 4px;
    background: var(--wa-green);
  }

  .quoted-content {
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    display: grid;
    gap: 2px;
  }

  .quoted-sender {
    color: var(--wa-green-dark);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .quoted-text {
    margin: 0;
    color: var(--muted);
    font-size: 0.8125rem;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .quoted-text :global(.icon) {
    vertical-align: -2px;
    margin-right: 2px;
    opacity: 0.7;
  }

  .quoted-media-label {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--muted);
  }

  .quoted-thumb {
    width: 44px;
    height: 44px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .retry-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 26px;
    margin-top: 4px;
    border: 0;
    border-radius: 13px;
    padding: 0 12px;
    color: white;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    background: #ea4335;
    cursor: pointer;
  }

  .reaction-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 3px;
  }

  .reaction-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
    border-radius: 999px;
    font-size: 0.75rem;
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
  }

  .media-card {
    display: block;
    width: min(260px, 72vw);
    min-width: 160px;
    min-height: 60px;
    margin: 2px -2px 4px -2px;
    border: 0;
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
    color: inherit;
    font: inherit;
    text-align: left;
    background: var(--border-color);
    position: relative;
    cursor: pointer;
  }

  .media-card.visual-media {
    min-height: 160px;
    background: transparent;
  }

  .visual-frame {
    position: relative;
    width: 100%;
    min-height: 160px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--border-color);
  }

  .visual-frame img,
  .visual-frame video,
  .visual-frame .sticker-image,
  .empty-visual {
    width: 100%;
    height: 100%;
    min-height: 160px;
    max-height: 300px;
    display: block;
    object-fit: cover;
  }

  .visual-frame .sticker-image {
    object-fit: contain;
    padding: 8px;
    background: transparent;
  }

  .media-card.preview-only .visual-frame img,
  .media-card.preview-only .visual-frame video,
  .media-card.preview-only .empty-visual {
    filter: blur(14px) saturate(0.7) brightness(0.6);
    transform: scale(1.06);
  }

  .download-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.3);
  }

  .download-circle {
    position: relative;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    color: white;
  }

  .download-circle svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .download-size {
    font-size: 0.6875rem;
    font-weight: 500;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .media-name {
    display: block;
    padding: 8px 10px 9px;
    color: var(--ink);
    font-size: 0.9rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-tile {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      "badge name"
      "badge hint";
    gap: 2px 10px;
    align-items: center;
    padding: 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  .file-tile span {
    grid-area: badge;
    display: grid;
    place-items: center;
    min-width: 40px;
    height: 40px;
    border-radius: 8px;
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--wa-green-dark);
  }

  .file-tile strong {
    grid-area: name;
    color: var(--ink);
    font-size: 0.8125rem;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-tile small {
    grid-area: hint;
    color: var(--muted);
    font-size: 0.6875rem;
  }

  .audio-player {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    min-width: 220px;
  }

  .audio-player.ptt {
    min-width: 200px;
  }

  .audio-play-btn {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: var(--wa-green-dark);
    color: white;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    cursor: pointer;
  }

  .audio-play-btn:active {
    transform: scale(0.92);
  }

  .audio-track {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .audio-waveform {
    display: flex;
    align-items: center;
    gap: 1.5px;
    height: 24px;
  }

  .audio-waveform span {
    flex: 1;
    min-width: 2px;
    max-width: 3px;
    border-radius: 1.5px;
    background: var(--muted);
    opacity: 0.5;
  }

  .audio-meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .audio-duration {
    font-size: 0.6875rem;
    color: var(--muted);
  }

  .audio-size {
    font-size: 0.6875rem;
    color: var(--wa-green-dark);
    font-weight: 500;
  }

  .audio-hidden {
    display: none;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
</style>
