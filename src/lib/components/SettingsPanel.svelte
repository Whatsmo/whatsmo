<script lang="ts">
  import { appState, setTheme } from '$lib/stores/app';
  import type { ThemeMode } from '$lib/api/types';

  const modes: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System default' }
  ];
</script>

<div class="settings-panel">
  <header class="settings-header">
    <h2>Settings</h2>
  </header>

  <section class="setting-group">
    <h3>Theme</h3>
    <div class="theme-options">
      {#each modes as mode}
        <label class="theme-option">
          <input
            type="radio"
            name="theme"
            value={mode.value}
            checked={$appState.theme === mode.value}
            on:change={() => setTheme(mode.value)}
          />
          <span>{mode.label}</span>
        </label>
      {/each}
    </div>
  </section>

  <section class="setting-group">
    <h3>About</h3>
    <p>Whatsmo Version 0.1.0</p>
    <p class="description">Rust-powered WhatsApp mobile companion.</p>
  </section>
</div>

<style>
  .settings-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--paper, #fbfbf6);
    color: var(--ink, #101f1b);
    overflow-y: auto;
    position: relative;
    z-index: 1;
  }

  .settings-header {
    padding: calc(14px + var(--safe-top, 0px)) 20px 16px;
    background: var(--paper, #fbfbf6);
    border-bottom: 1px solid var(--border-color, #edf0eb);
    position: relative;
    z-index: 5;
  }

  .settings-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--ink, #101f1b);
  }

  .setting-group {
    padding: 24px 20px;
    border-bottom: 1px solid var(--border-color, #edf0eb);
  }

  h3 {
    margin: 0 0 20px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--wa-green, #008069);
    text-transform: none;
    letter-spacing: normal;
  }

  .theme-options {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: 16px;
    cursor: pointer;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .theme-option input[type="radio"] {
    width: 20px;
    height: 20px;
    accent-color: var(--wa-green, #008069);
    cursor: pointer;
    margin: 0;
  }

  p {
    margin: 0 0 8px;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .description {
    color: var(--muted, #667781);
    font-size: 0.9rem;
  }
</style>
