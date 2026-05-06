<script lang="ts">
  import type { AccountDevicePayload, AuthPayload, HistorySyncProgressPayload } from '$lib/api/types';
  import AuthPanel from './AuthPanel.svelte';
  import Icon from './Icon.svelte';

  export let auth: AuthPayload;
  export let account: AccountDevicePayload | null = null;
  export let historySync: HistorySyncProgressPayload | null = null;

  $: progress = historySync ? (historySync.total > 0 ? (historySync.processed / historySync.total) * 100 : 0) : 0;
  $: showSync = historySync && (historySync.active || progress > 0);
</script>

<section class="devices-panel" aria-label="Linked devices">
  <div class="scroll-area">
    <!-- Sync Banner -->
    {#if showSync && historySync}
      <div class="sync-banner" class:active={historySync.active}>
        <div class="sync-row">
          <div class="sync-icon">
            {#if historySync.active}
              <span class="spinner"></span>
            {:else}
              <Icon name="check_circle" size="20px" />
            {/if}
          </div>
          <div class="sync-body">
            <strong>{historySync.active ? 'Syncing messages' : 'Sync complete'}</strong>
            <span>{historySync.message}</span>
          </div>
          {#if historySync.active}
            <span class="sync-pct">{Math.round(progress)}%</span>
          {/if}
        </div>
        {#if historySync.active}
          <div class="progress-track">
            <div class="progress-thumb" style="width: {progress}%"></div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Auth Card -->
    <div class="auth-card">
      <AuthPanel {auth} {account} />
    </div>

    <!-- Info Footer -->
    <div class="info-footer">
      <div class="info-row">
        <div class="info-icon"><Icon name="lock" size="18px" /></div>
        <p>Your personal messages are <strong>end-to-end encrypted</strong>. No one outside of your chats, not even WhatsApp, can read or listen to them.</p>
      </div>
    </div>
  </div>
</section>

<style>
  .devices-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--app-bg);
  }

  .scroll-area {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }

  .sync-banner {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--paper);
    transition: box-shadow 0.2s ease;
  }

  .sync-banner.active {
    box-shadow: 0 1px 4px rgba(0, 128, 105, 0.08);
  }

  .sync-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sync-icon {
    flex-shrink: 0;
    color: var(--wa-green-dark);
  }

  .sync-body {
    flex: 1;
    min-width: 0;
  }

  .sync-body strong {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--ink);
    margin-bottom: 1px;
  }

  .sync-body span {
    display: block;
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sync-pct {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--wa-green-dark);
    flex-shrink: 0;
  }

  .progress-track {
    height: 2px;
    margin-top: 10px;
    border-radius: 1px;
    background: var(--border-color);
    overflow: hidden;
  }

  .progress-thumb {
    height: 100%;
    border-radius: 1px;
    background: var(--wa-green-dark);
    transition: width 0.3s ease;
  }

  .spinner {
    display: block;
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-color);
    border-top-color: var(--wa-green-dark);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .auth-card {
    padding: 16px;
    border-radius: 12px;
    background: var(--paper);
  }

  .info-footer {
    padding: 8px 4px 20px;
  }

  .info-row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .info-icon {
    flex-shrink: 0;
    color: var(--muted);
    padding-top: 1px;
  }

  .info-row p {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
    line-height: 1.45;
  }

  .info-row p strong {
    color: var(--muted);
    font-weight: 500;
  }
</style>
