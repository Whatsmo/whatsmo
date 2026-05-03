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
    background: var(--app-bg, #efeae2);
  }

  .scroll-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  /* ─── Sync Banner ─── */
  .sync-banner {
    padding: 14px 16px;
    border-radius: 16px;
    background: var(--paper, white);
    border: 1px solid var(--border-color, #e9edef);
    transition: border-color 0.3s, box-shadow 0.3s;
  }

  .sync-banner.active {
    border-color: color-mix(in srgb, var(--wa-green, #25d366) 40%, transparent);
    box-shadow: 0 2px 12px rgba(0, 128, 105, 0.06);
  }

  .sync-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sync-icon {
    flex-shrink: 0;
    color: var(--wa-green, #008069);
  }

  .sync-body {
    flex: 1;
    min-width: 0;
  }

  .sync-body strong {
    display: block;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ink, #111b21);
    margin-bottom: 1px;
  }

  .sync-body span {
    display: block;
    font-size: 0.78rem;
    color: var(--muted, #667781);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sync-pct {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--wa-green, #008069);
    flex-shrink: 0;
  }

  .progress-track {
    height: 3px;
    margin-top: 12px;
    border-radius: 2px;
    background: var(--border-color, #e9edef);
    overflow: hidden;
  }

  .progress-thumb {
    height: 100%;
    border-radius: 2px;
    background: var(--wa-green, #008069);
    transition: width 0.4s ease;
  }

  .spinner {
    display: block;
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-color, #e9edef);
    border-top-color: var(--wa-green, #008069);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ─── Auth Card ─── */
  .auth-card {
    padding: 20px;
    border-radius: 18px;
    background: var(--paper, white);
    border: 1px solid var(--border-color, #e9edef);
  }

  /* ─── Info Footer ─── */
  .info-footer {
    padding: 8px 4px 24px;
  }

  .info-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .info-icon {
    flex-shrink: 0;
    color: var(--muted, #8696a0);
    padding-top: 1px;
  }

  .info-row p {
    margin: 0;
    font-size: 0.78rem;
    color: var(--muted, #8696a0);
    line-height: 1.5;
  }

  .info-row p strong {
    color: var(--muted, #667781);
  }
</style>
