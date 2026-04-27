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
  <div class="input-wrapper">
    <button type="button" class="ghost" aria-label="Attach media" on:click={() => dispatch('attach')}>
      <span class="material-symbols-rounded">add</span>
    </button>
    <input bind:value={draft} placeholder="Message" aria-label="Message" />
  </div>
  <button type="submit" class="send" aria-label="Send message">
    <span class="material-symbols-rounded">send</span>
  </button>
</form>

<style>
  .composer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: transparent;
  }

  .input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    background: var(--message-in, white);
    border-radius: 24px;
    padding: 4px;
    box-shadow: 0 1px 1px rgba(0,0,0,0.05);
  }

  button,
  input {
    border: 0;
    font: inherit;
    outline: none;
  }

  input {
    flex: 1;
    min-height: 40px;
    padding: 0 12px;
    color: var(--ink, #101f1b);
    background: transparent;
    font-size: 1rem;
  }

  button {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ghost {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    color: var(--muted, #8696a0);
    background: transparent;
    font-size: 1.5rem;
  }

  .send {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    color: white;
    font-size: 1.4rem;
    background: var(--wa-green, #008069);
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    flex-shrink: 0;
  }
</style>
