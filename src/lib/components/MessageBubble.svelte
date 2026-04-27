<script lang="ts">
  import type { ChatMessage } from '$lib/api/types';

  export let message: ChatMessage;
  export let onRetry: (message: ChatMessage) => void = () => undefined;
  export let onDownloadMedia: (message: ChatMessage) => void = () => undefined;

  const formatter = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });

  $: ticks = message.status === 'failed' ? '!' : message.status === 'queued' ? '◷' : '✓✓';
  $: canRetry = message.fromMe && message.status === 'failed' && Boolean(message.text) && !message.deleted;
  $: canDownload = Boolean(message.media && !message.media.cachedDataUrl && message.media.directPath);
</script>

<article class:mine={message.fromMe} class="bubble">
  {#if message.deleted}
    <p class="deleted">{message.text ?? 'This message was deleted.'}</p>
  {:else if message.media}
    <div class="media-card">
      <span>{message.media.kind}</span>
      {#if message.media.cachedDataUrl && message.media.kind === 'image'}
        <img src={message.media.cachedDataUrl} alt={message.media.name} />
      {:else if message.media.cachedDataUrl && message.media.kind === 'video'}
        <video src={message.media.cachedDataUrl} controls preload="metadata">
          <track kind="captions" />
        </video>
      {:else if message.media.cachedDataUrl}
        <a href={message.media.cachedDataUrl} download={message.media.name}>Open downloaded file</a>
      {/if}
      <strong>{message.media.name}</strong>
    </div>
  {/if}
  {#if message.text && !message.deleted}
    <p>{message.text}</p>
  {/if}
  <footer>
    <time>{formatter.format(message.timestamp)}</time>
    {#if message.edited && !message.deleted}
      <em>edited</em>
    {/if}
    {#if message.fromMe}
      <span class:read={message.status === 'read'}>{ticks}</span>
    {/if}
  </footer>
  {#if canRetry}
    <button class="retry-button" on:click={() => onRetry(message)}>Retry</button>
  {/if}
  {#if canDownload}
    <button class="download-button" on:click={() => onDownloadMedia(message)}>Download</button>
  {/if}
</article>

<style>
  .bubble {
    justify-self: start;
    max-width: 82%;
    padding: 7px 8px 5px;
    border-radius: 8px 8px 8px 2px;
    color: var(--ink, #101f1b);
    background: var(--message-in, white);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
    animation: rise 160ms ease both;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .bubble.mine {
    justify-self: end;
    border-radius: 8px 8px 2px;
    background: var(--message-out, #d9fdd3);
  }

  p {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.36;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    margin-top: 5px;
    color: #667781;
    font-size: 0.68rem;
    font-weight: 750;
  }

  footer span.read {
    color: #34b7f1;
  }

  footer em {
    font-style: normal;
  }

  .deleted {
    color: #667781;
    font-style: italic;
  }

  .retry-button,
  .download-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    margin-top: 7px;
    border: 0;
    border-radius: 999px;
    padding: 0 12px;
    color: white;
    font: inherit;
    font-size: 0.74rem;
    font-weight: 900;
    background: #b3261e;
  }

  .download-button {
    background: var(--wa-green, #008069);
  }

  .media-card {
    display: grid;
    gap: 6px;
    min-width: 180px;
    min-height: 116px;
    margin-bottom: 8px;
    padding: 14px;
    border-radius: 8px;
    color: #f7fff6;
    background:
      linear-gradient(135deg, rgba(6, 31, 26, 0.18), rgba(6, 31, 26, 0.7)),
      radial-gradient(circle at 30% 20%, #34b7f1, transparent 36%),
      linear-gradient(135deg, #128c7e, #075e54);
  }

  .media-card span {
    width: fit-content;
    padding: 5px 9px;
    border-radius: 999px;
    color: #061f1a;
    font-size: 0.72rem;
    font-weight: 900;
    text-transform: uppercase;
    background: #d9fdd3;
  }

  .media-card strong {
    align-self: end;
  }

  .media-card img,
  .media-card video {
    width: 100%;
    max-height: 210px;
    border-radius: 8px;
    object-fit: cover;
  }

  .media-card a {
    color: #d9fdd3;
    font-weight: 900;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
</style>
