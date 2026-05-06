<script lang="ts">
  import { appState, setShowGroupAvatars, setTheme, updatePowerFeatures } from '$lib/stores/app';
  import type { ThemeMode } from '$lib/api/types';
  import Icon from './Icon.svelte';

  const modes: { value: ThemeMode; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: 'light_mode' },
    { value: 'dark', label: 'Dark', icon: 'dark_mode' },
    { value: 'system', label: 'System default', icon: 'desktop_windows' }
  ];

  function toggleAntiDelete(): void {
    updatePowerFeatures({ antiDelete: !$appState.powerFeatures.antiDelete });
  }

  function toggleAntiEdit(): void {
    updatePowerFeatures({ antiEdit: !$appState.powerFeatures.antiEdit });
  }

  function toggleAutoForward(): void {
    updatePowerFeatures({ autoForwardDeleted: !$appState.powerFeatures.autoForwardDeleted });
  }

  function updateForwardTarget(event: Event): void {
    const input = event.target as HTMLInputElement;
    updatePowerFeatures({ forwardTargetId: input.value.trim() });
  }
</script>

<div class="settings-panel">
  <header class="settings-header">
    <h2>Settings</h2>
  </header>

  <section class="setting-group">
    <h3>Theme</h3>
    <div class="theme-options">
      {#each modes as mode}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <label class="theme-option" class:active={$appState.theme === mode.value}>
          <div class="theme-icon">
            <Icon name={mode.icon} size="24px" />
          </div>
          <div class="theme-text">
            <span>{mode.label}</span>
          </div>
          <input
            type="radio"
            name="theme"
            value={mode.value}
            checked={$appState.theme === mode.value}
            on:change={() => setTheme(mode.value)}
          />
          <div class="radio-indicator"></div>
        </label>
      {/each}
    </div>
  </section>

  <section class="setting-group">
    <h3>Chat</h3>
    <div class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">Show group avatars</span>
        <span class="toggle-desc">Display sender avatars next to messages in group chats</span>
      </div>
      <button
        class="toggle-switch"
        class:active={$appState.showGroupAvatars}
        on:click={() => setShowGroupAvatars(!$appState.showGroupAvatars)}
        aria-label="Toggle group avatars"
      >
        <span class="toggle-thumb"></span>
      </button>
    </div>
  </section>

  <section class="setting-group">
    <h3>
      <Icon name="bolt" size="16px" />
      Power Features
    </h3>
    <p class="section-desc">Advanced features not available in official WhatsApp.</p>

    <div class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">Anti-Delete</span>
        <span class="toggle-desc">Keep messages visible even after sender deletes them</span>
      </div>
      <button
        class="toggle-switch"
        class:active={$appState.powerFeatures.antiDelete}
        on:click={toggleAntiDelete}
        aria-label="Toggle Anti-Delete"
      >
        <span class="toggle-thumb"></span>
      </button>
    </div>

    <div class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">Anti-Edit</span>
        <span class="toggle-desc">Preserve original text when messages are edited</span>
      </div>
      <button
        class="toggle-switch"
        class:active={$appState.powerFeatures.antiEdit}
        on:click={toggleAntiEdit}
        aria-label="Toggle Anti-Edit"
      >
        <span class="toggle-thumb"></span>
      </button>
    </div>

    {#if $appState.powerFeatures.antiDelete}
      <div class="toggle-row">
        <div class="toggle-info">
          <span class="toggle-label">Auto-Forward Deleted</span>
          <span class="toggle-desc">Forward deleted messages to a specific chat</span>
        </div>
        <button
          class="toggle-switch"
          class:active={$appState.powerFeatures.autoForwardDeleted}
          on:click={toggleAutoForward}
          aria-label="Toggle Auto-Forward"
        >
          <span class="toggle-thumb"></span>
        </button>
      </div>

      {#if $appState.powerFeatures.autoForwardDeleted}
        <div class="forward-target">
          <label class="target-label">
            <Icon name="forward_to_inbox" size="18px" />
            <span>Forward to Chat ID</span>
          </label>
          <input
            type="text"
            class="target-input"
            placeholder="e.g. 6281234567890@s.whatsapp.net"
            value={$appState.powerFeatures.forwardTargetId}
            on:input={updateForwardTarget}
          />
          <span class="target-hint">Use a JID from your chat list or create a group for logging.</span>
        </div>
      {/if}
    {/if}
  </section>

  <section class="setting-group about-section">
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
    -webkit-overflow-scrolling: touch;
    position: relative;
    z-index: 1;
  }

  .settings-header {
    padding: calc(12px + var(--safe-top, 0px)) 20px 10px;
    background: var(--paper);
    position: relative;
    z-index: 5;
  }

  .settings-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 500;
    color: var(--ink);
  }

  .setting-group {
    padding: 16px 20px;
    border-bottom: 8px solid var(--app-bg);
  }

  h3 {
    margin: 0 0 12px;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--wa-green-dark);
    letter-spacing: 0.02em;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-desc {
    margin: -6px 0 12px;
    font-size: 0.8125rem;
    color: var(--muted);
    line-height: 1.4;
  }

  .theme-options {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.15s ease;
    background: transparent;
  }

  .theme-option:active {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }

  :global(.app-stage[data-theme="dark"]) .theme-option:active {
    background: rgba(255, 255, 255, 0.04);
  }

  .theme-option.active {
    background: color-mix(in srgb, var(--wa-green) 8%, transparent);
  }

  .theme-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--border-color);
    color: var(--muted);
    font-size: 1.1rem;
    transition: all 0.15s ease;
  }

  .theme-option.active .theme-icon {
    color: var(--wa-green-dark);
    background: var(--nav-active);
  }

  .theme-text {
    flex: 1;
    font-size: 0.9375rem;
    font-weight: 400;
    color: var(--ink);
  }

  .theme-option input[type="radio"] {
    display: none;
  }

  .radio-indicator {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--muted);
    position: relative;
    transition: border-color 0.2s ease;
  }

  .theme-option.active .radio-indicator {
    border-color: var(--wa-green-dark);
  }

  .theme-option.active .radio-indicator::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(1);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--wa-green-dark);
    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .radio-indicator::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--wa-green-dark);
    transition: transform 0.2s ease;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
  }

  .toggle-row + .toggle-row {
    border-top: 1px solid var(--border-color);
  }

  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    margin-right: 14px;
  }

  .toggle-label {
    font-size: 0.9375rem;
    font-weight: 400;
    color: var(--ink);
  }

  .toggle-desc {
    font-size: 0.75rem;
    color: var(--muted);
    line-height: 1.35;
  }

  .toggle-switch {
    position: relative;
    width: 48px;
    height: 28px;
    border-radius: 14px;
    border: none;
    background: var(--border-color);
    cursor: pointer;
    transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
    padding: 0;
  }

  .toggle-switch.active {
    background: var(--wa-green-dark);
  }

  .toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(20px);
  }

  .forward-target {
    padding: 10px 0 4px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .target-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--ink);
  }

  .target-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    font: inherit;
    font-size: 0.875rem;
    color: var(--ink);
    background: transparent;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .target-input:focus {
    border-color: var(--wa-green-dark);
  }

  .target-hint {
    font-size: 0.75rem;
    color: var(--muted);
    line-height: 1.35;
  }

  .about-section p {
    margin: 0 0 2px;
    font-size: 0.9375rem;
    font-weight: 400;
  }

  .about-section .description {
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 400;
    line-height: 1.4;
  }
</style>
