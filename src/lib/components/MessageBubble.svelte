<script lang="ts">
  import type { ChatMessage } from '$lib/api/types';
  import Icon from './Icon.svelte';

  export let message: ChatMessage;
  export let showSenderName = false;
  export let onRetry: (message: ChatMessage) => void = () => undefined;
  export let onDownloadMedia: (message: ChatMessage) => void = () => undefined;
  export let onOpenMedia: (message: ChatMessage) => void = () => undefined;
  export let onLongPress: (message: ChatMessage) => void = () => undefined;

  const LONG_PRESS_MS = 420;
  let longPressTimer: number | undefined;
  let suppressClick = false;

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
</script>

<article
  class:mine={message.fromMe}
  class:sticker={isSticker}
  class="bubble"
  on:pointerdown={startLongPress}
  on:pointerup={cancelLongPress}
  on:pointerleave={cancelLongPress}
  on:pointercancel={cancelLongPress}
  on:contextmenu|preventDefault={() => onLongPress(message)}
>
  {#if showSenderName && message.senderName}
    <p class="sender-name">{message.senderName}</p>
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
              <span><Icon name="download" size="28px" /></span>
            </div>
          {/if}
        </div>
      {:else if message.media.kind === 'audio'}
        <div class="file-tile audio-tile">
          <span><Icon name="mic" size="24px" /></span>
          <strong>{message.media.ptt ? 'Voice message' : 'Audio'}</strong>
          {#if message.media.cachedDataUrl}
            <audio src={message.media.cachedDataUrl} controls></audio>
          {:else}
            <small>{canDownload ? 'Download to listen' : message.status === 'queued' ? 'Sending…' : 'Audio attachment'}</small>
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
</article>

<style>
  .bubble {
    justify-self: start;
    max-width: 85%;
    padding: 6px 10px 8px;
    border-radius: 0 8px 8px 8px;
    color: var(--ink);
    background: var(--message-in);
    box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.13);
    animation: rise 160ms ease both;
    word-wrap: break-word;
    overflow-wrap: break-word;
    position: relative;
    margin-left: 8px;
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
    font-size: 0.95rem;
    line-height: 1.35;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 2px;
    margin-bottom: -2px;
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 500;
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

  .sender-name {
    margin-bottom: 2px;
    color: var(--wa-green-dark);
    font-size: 0.8rem;
    font-weight: 500;
  }

  .retry-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    margin-top: 6px;
    border: 0;
    border-radius: 14px;
    padding: 0 16px;
    color: white;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 500;
    background: #ea4335;
    cursor: pointer;
  }

  .media-card {
    display: block;
    width: min(280px, 75vw);
    min-width: 180px;
    min-height: 74px;
    margin: 2px -4px 6px -4px;
    border: 0;
    border-radius: 6px;
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
    min-height: 180px;
    background: transparent;
  }

  .visual-frame {
    position: relative;
    width: 100%;
    min-height: 180px;
    overflow: hidden;
    border-radius: 6px;
    background: var(--border-color);
  }

  .visual-frame img,
  .visual-frame video,
  .visual-frame .sticker-image,
  .empty-visual {
    width: 100%;
    height: 100%;
    min-height: 180px;
    max-height: 340px;
    display: block;
    object-fit: cover;
  }

  .visual-frame .sticker-image {
    object-fit: contain;
    padding: 10px;
    background: transparent;
  }

  .media-card.preview-only .visual-frame img,
  .media-card.preview-only .visual-frame video,
  .media-card.preview-only .empty-visual {
    filter: blur(12px) saturate(0.82) brightness(0.68);
    transform: scale(1.04);
  }

  .download-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.2);
  }

  .download-overlay span {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    color: white;
    font-size: 1.5rem;
    font-weight: 400;
    background: rgba(0, 0, 0, 0.5);
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
    gap: 2px 12px;
    align-items: center;
    padding: 12px;
  }

  .file-tile span {
    grid-area: badge;
    display: grid;
    place-items: center;
    min-width: 44px;
    height: 44px;
    border-radius: 50%;
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--wa-green-dark, #008069);
  }

  .file-tile strong {
    grid-area: name;
    color: var(--ink);
    font-size: 0.95rem;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-tile small {
    grid-area: hint;
    color: var(--muted);
    font-size: 0.8rem;
  }

  .audio-tile audio {
    grid-column: 2;
    width: 100%;
    min-width: 180px;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
</style>
