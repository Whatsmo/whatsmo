<script lang="ts">
  import { appState, setTheme, refreshAccountDevice, setAuth, setConnection } from '$lib/stores/app';
  import { disconnectSession, logoutSession } from '$lib/api/whatsmo';
  import type { ThemeMode } from '$lib/api/types';
  import Icon from './Icon.svelte';

  let busy = false;

  const modes: { value: ThemeMode; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: 'light_mode' },
    { value: 'dark', label: 'Dark', icon: 'dark_mode' },
    { value: 'system', label: 'System default', icon: 'desktop_windows' }
  ];

  async function disconnectLocal(): Promise<void> {
    busy = true;
    try {
      setConnection(await disconnectSession());
      await refreshAccountDevice();
    } catch (error) {
      console.error('Failed to disconnect locally', error);
    } finally {
      busy = false;
    }
  }

  async function unlinkDevice(): Promise<void> {
    const confirmed = window.confirm(
      'Unlink this Whatsmo companion from WhatsApp? You will need to pair again after this.'
    );
    if (!confirmed) return;

    busy = true;
    try {
      setConnection(await logoutSession());
      await refreshAccountDevice();
    } catch (error) {
      console.error('Failed to unlink device', error);
    } finally {
      busy = false;
    }
  }

  // A simple deterministic gradient function for the profile avatar
  function gradientFromName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `linear-gradient(135deg, hsl(${h}, 70%, 60%), hsl(${(h + 40) % 360}, 70%, 45%))`;
  }
</script>

<div class="settings-panel">
  <header class="settings-header">
    <h2>Settings</h2>
  </header>

  {#if $appState.auth.mode === 'connected' && $appState.account}
    <section class="setting-group account-section">
      <div class="account-profile">
        <div class="avatar" style="background: {gradientFromName($appState.account.pushName || $appState.account.phoneJid || 'User')}">
          <Icon name="person" size="40px" />
        </div>
        <div class="account-info">
          <h3>{$appState.account.pushName ?? $appState.account.phoneJid ?? 'Linked account'}</h3>
          <span class="detail">{$appState.account.phoneJid ?? 'Phone number hidden'}</span>
          <span class="sub-detail">{$appState.account.lidJid ?? ''}</span>
        </div>
      </div>
      <div class="account-actions">
        <button class="action-btn disconnect-btn" disabled={busy} on:click={disconnectLocal}>
          <Icon name="power_settings_new" size="20px" /> Stop locally
        </button>
        <button class="action-btn unlink-btn" disabled={busy} on:click={unlinkDevice}>
          <Icon name="logout" size="20px" /> Unlink
        </button>
      </div>
    </section>
  {/if}

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
    position: relative;
    z-index: 1;
  }

  .settings-header {
    padding: calc(16px + var(--safe-top, 0px)) 16px 12px;
    background: var(--paper);
    position: relative;
    z-index: 5;
    border-bottom: 1px solid var(--border-color);
  }

  .settings-header h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
  }

  .setting-group {
    padding: 24px 20px;
    border-bottom: 1px solid var(--border-color);
    animation: fade-in 200ms ease-out both;
  }

  h3 {
    margin: 0 0 16px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--wa-green-dark, #008069);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Account Section */
  .account-profile {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: white;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .account-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .account-info h3 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--ink);
    text-transform: none;
    letter-spacing: normal;
  }

  .account-info .detail {
    font-size: 0.95rem;
    color: var(--muted);
  }

  .account-info .sub-detail {
    font-size: 0.8rem;
    color: var(--muted);
    opacity: 0.8;
  }

  .account-actions {
    display: flex;
    gap: 12px;
  }

  .action-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    border: none;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn:active {
    transform: scale(0.97);
  }

  .disconnect-btn {
    background: var(--nav-active);
    color: var(--wa-green-dark);
  }

  .disconnect-btn:hover {
    background: var(--wa-mint);
  }

  .unlink-btn {
    background: rgba(234, 67, 53, 0.1);
    color: #ea4335;
  }

  .unlink-btn:hover {
    background: rgba(234, 67, 53, 0.15);
  }

  /* Theme Options */
  .theme-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: transparent;
  }

  .theme-option:hover {
    background: rgba(0, 0, 0, 0.03);
  }

  :global(.app-stage[data-theme="dark"]) .theme-option:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .theme-option.active {
    background: var(--nav-active);
  }

  .theme-icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--app-bg);
    color: var(--muted);
    transition: all 0.2s ease;
  }

  .theme-option.active .theme-icon {
    color: var(--wa-green-dark);
    background: var(--paper);
  }

  .theme-text {
    flex: 1;
    font-size: 1.05rem;
    font-weight: 500;
    color: var(--ink);
  }

  .theme-option input[type="radio"] {
    display: none;
  }

  .radio-indicator {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--muted);
    position: relative;
    transition: all 0.2s ease;
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

  /* About Section */
  .about-section p {
    margin: 0 0 4px;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .about-section .description {
    color: var(--muted);
    font-size: 0.9rem;
    font-weight: 400;
    line-height: 1.4;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
