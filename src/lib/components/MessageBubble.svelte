<script lang="ts">
  import type { ChatMessage } from '$lib/api/types';

  export let message: ChatMessage;

  const formatter = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });

  $: ticks = message.status === 'failed' ? '!' : message.status === 'queued' ? '◷' : '✓✓';
</script>

<article class:mine={message.fromMe} class="bubble">
  {#if message.deleted}
    <p class="deleted">{message.text ?? 'This message was deleted.'}</p>
  {:else if message.media}
    <div class="media-card">
      <span>{message.media.kind}</span>
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
</article>

<style>
  .bubble {
    justify-self: start;
    max-width: 82%;
    padding: 7px 8px 5px;
    border-radius: 8px 8px 8px 2px;
    color: var(--ink, #101f1b);
    background: white;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
    animation: rise 160ms ease both;
  }

  .bubble.mine {
    justify-self: end;
    border-radius: 8px 8px 2px;
    background: #d9fdd3;
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

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
</style>
