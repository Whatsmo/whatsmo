<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    send: string;
    attach: void;
  }>();

  let draft = '';

  function submit(): void {
    const text = draft.trim();
    if (!text) {
      return;
    }

    dispatch('send', text);
    draft = '';
  }
</script>

<form class="composer" on:submit|preventDefault={submit}>
  <button type="button" class="ghost" aria-label="Attach media" on:click={() => dispatch('attach')}>＋</button>
  <input bind:value={draft} placeholder="Message" aria-label="Message" />
  <button type="submit" class="send" aria-label="Send message">›</button>
</form>

<style>
  .composer {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    padding: 8px;
    background: rgba(239, 231, 221, 0.96);
  }

  button,
  input {
    min-height: 48px;
    border: 0;
    border-radius: 999px;
    font: inherit;
  }

  input {
    min-width: 0;
    padding: 0 15px;
    color: var(--ink, #101f1b);
    outline: none;
    background: white;
  }

  button {
    cursor: pointer;
    font-weight: 1000;
  }

  .ghost {
    width: 48px;
    color: #54645f;
    background: white;
  }

  .send {
    width: 48px;
    color: #f7fff6;
    font-size: 1.6rem;
    background: var(--wa-green, #008069);
  }
</style>
