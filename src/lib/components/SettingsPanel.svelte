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
    background: var(--paper);
    color: var(--ink);
    overflow-y: auto;
    position: relative;
    z-index: 1;
  }

  .settings-header {
    padding: calc(16px + var(--safe-top, 0px)) 16px 12px;
    background: var(--paper);
    position: relative;
    z-index: 5;
  }

  .settings-header h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--ink);
  }

  .setting-group {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color);
  }

  h3 {
    margin: 0 0 16px;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--muted);
    text-transform: none;
    letter-spacing: normal;
  }

  .theme-options {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: 16px;
    cursor: pointer;
    font-size: 1.05rem;
    font-weight: 400;
  }

  .theme-option input[type="radio"] {
    width: 20px;
    height: 20px;
    accent-color: var(--wa-green-dark);
    cursor: pointer;
    margin: 0;
  }

  p {
    margin: 0 0 4px;
    font-size: 1.05rem;
    font-weight: 400;
  }

  .description {
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
