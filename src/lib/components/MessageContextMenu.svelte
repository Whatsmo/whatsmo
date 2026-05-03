<script lang="ts">
  import type { ChatMessage } from '$lib/api/types';
  import { createEventDispatcher } from 'svelte';
  import Icon from './Icon.svelte';

  export let message: ChatMessage;
  export let visible = false;

  const dispatch = createEventDispatcher<{
    reply: ChatMessage;
    react: ChatMessage;
    copy: ChatMessage;
    edit: ChatMessage;
    delete: ChatMessage;
    forward: ChatMessage;
    close: void;
  }>();

  $: canEdit = message.fromMe && Boolean(message.text) && !message.deleted && !message.deletedBySender;
  $: canDelete = message.fromMe && !message.deleted;
  $: canCopy = Boolean(message.text) && !message.deleted;

  function action(type: 'reply' | 'react' | 'copy' | 'edit' | 'delete' | 'forward'): void {
    dispatch(type, message);
    dispatch('close');
  }
</script>

{#if visible}
  <div class="context-backdrop">
    <button class="context-dismiss" aria-label="Close menu" on:click={() => dispatch('close')}></button>
    <section class="context-sheet" aria-label="Message actions">
      <button on:click={() => action('reply')}>
        <Icon name="reply" size="22px" /> Reply
      </button>
      <button on:click={() => action('react')}>
        <Icon name="mood" size="22px" /> React
      </button>
      {#if canCopy}
        <button on:click={() => action('copy')}>
          <Icon name="content_copy" size="22px" /> Copy text
        </button>
      {/if}
      {#if canEdit}
        <button on:click={() => action('edit')}>
          <Icon name="edit" size="22px" /> Edit
        </button>
      {/if}
      {#if canDelete}
        <button on:click={() => action('delete')}>
          <Icon name="delete" size="22px" /> Delete for everyone
        </button>
      {/if}
      <button on:click={() => action('forward')}>
        <Icon name="forward" size="22px" /> Forward
      </button>
    </section>
  </div>
{/if}

<style>
  .context-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    align-items: end;
    background: rgba(0, 0, 0, 0.35);
  }

  .context-dismiss {
    position: absolute;
    inset: 0;
    border: 0;
    background: transparent;
  }

  .context-sheet {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 4px;
    margin: 0 auto;
    width: min(100%, 430px);
    border-radius: 26px 26px 0 0;
    padding: 14px 12px max(14px, calc(10px + var(--safe-bottom, 0px)));
    background: var(--paper);
    box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.3);
  }

  .context-sheet button {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 50px;
    border: 0;
    border-radius: 14px;
    padding: 0 16px;
    color: var(--ink);
    font: inherit;
    font-size: 0.95rem;
    font-weight: 500;
    text-align: left;
    background: transparent;
  }

  .context-sheet button:active {
    background: var(--nav-active);
  }
</style>
