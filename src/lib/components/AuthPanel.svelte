<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import type { AccountDevicePayload, AuthPayload } from '$lib/api/types';
  import { disconnectSession, logoutSession, requestPairCode, startQrAuth } from '$lib/api/whatsmo';
  import { refreshAccountDevice, requestNotifications, setAuth, setConnection } from '$lib/stores/app';
  import Icon from './Icon.svelte';

  export let auth: AuthPayload;
  export let account: AccountDevicePayload | null = null;

  let phoneNumber = '';
  let qrSvg = '';
  let busy = false;
  let activeTab: 'qr' | 'phone' = 'qr';

  $: if (auth.qrCode) {
    QRCode.toString(auth.qrCode, {
      type: 'svg',
      margin: 2,
      color: {
        dark: '#111b21',
        light: '#ffffff'
      }
    }).then((svg) => {
      qrSvg = svg;
    });
  } else {
    qrSvg = '';
  }

  $: isConnecting = auth.mode === 'connecting' || auth.mode === 'qr' || auth.mode === 'pair-code' || busy;
  $: isConnected = auth.mode === 'connected';
  $: statusLabel = isConnected
    ? account?.connected && account?.loggedIn ? 'Active' : account?.running ? 'Reconnecting' : 'Stopped'
    : '';

  onMount(() => {
    void requestNotifications();
  });

  async function beginQr(): Promise<void> {
    busy = true;
    setAuth({ mode: 'connecting', message: 'Starting encrypted session...' });
    try {
      setAuth(await startQrAuth());
    } finally {
      busy = false;
    }
  }

  async function beginPairCode(): Promise<void> {
    const cleaned = phoneNumber.replace(/[^0-9]/g, '');
    if (cleaned.length < 8) {
      setAuth({ mode: 'error', message: 'Enter a valid phone number with country code (e.g. 62812...)' });
      return;
    }

    busy = true;
    setAuth({ mode: 'connecting', phoneNumber: cleaned, message: 'Requesting pair code...' });
    try {
      setAuth(await requestPairCode(cleaned));
    } finally {
      busy = false;
    }
  }

  async function disconnectLocal(): Promise<void> {
    busy = true;
    try {
      setConnection(await disconnectSession());
      await refreshAccountDevice();
    } catch (error) {
      setAuth({ mode: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      busy = false;
    }
  }

  async function unlinkDevice(): Promise<void> {
    const confirmed = window.confirm(
      'Unlink this Whatsmo companion from WhatsApp? You will need to pair again.'
    );
    if (!confirmed) return;

    busy = true;
    setAuth({ mode: 'connecting', message: 'Unlinking companion...' });
    try {
      setConnection(await logoutSession());
      await refreshAccountDevice();
    } catch (error) {
      setAuth({ mode: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      busy = false;
    }
  }

  function resetAuth(): void {
    setAuth({ mode: 'idle' });
  }
</script>

{#if isConnected}
  <!-- Connected State -->
  <div class="connected-view">
    <div class="status-badge">
      <div class="badge-dot" class:healthy={account?.connected && account?.loggedIn}></div>
      <span>{statusLabel}</span>
    </div>

    <div class="device-card">
      <div class="device-avatar">
        <Icon name="smartphone" size="28px" />
      </div>
      <div class="device-info">
        <strong>{account?.pushName ?? 'Linked account'}</strong>
        <span>{account?.phoneJid ?? 'Phone number syncing...'}</span>
      </div>
    </div>

    <div class="detail-rows">
      <div class="detail-row">
        <span class="detail-label">Device name</span>
        <span class="detail-value">{account?.deviceName ?? 'Whatsmo companion'}</span>
      </div>
      {#if account?.lidJid}
        <div class="detail-row">
          <span class="detail-label">Linked ID</span>
          <span class="detail-value">{account.lidJid}</span>
        </div>
      {/if}
      <div class="detail-row">
        <span class="detail-label">Session health</span>
        <span class="detail-value" class:healthy={account?.connected && account?.loggedIn}>
          {account?.connected && account?.loggedIn
            ? 'Connected and logged in'
            : account?.running
              ? 'Running, waiting for auth'
              : 'Stopped'}
        </span>
      </div>
    </div>

    <div class="connected-actions">
      <button class="btn btn-outline" disabled={busy} on:click={disconnectLocal}>
        <Icon name="power_settings_new" size="18px" />
        Stop locally
      </button>
      <button class="btn btn-danger" disabled={busy} on:click={unlinkDevice}>
        <Icon name="link_off" size="18px" />
        Unlink device
      </button>
    </div>
  </div>

{:else if auth.mode === 'error'}
  <!-- Error State -->
  <div class="error-view">
    <div class="error-icon-wrap">
      <Icon name="error_outline" size="48px" />
    </div>
    <h3>Connection failed</h3>
    <p>{auth.message ?? 'Something went wrong while pairing.'}</p>
    <button class="btn btn-primary" on:click={resetAuth}>Try again</button>
  </div>

{:else if isConnecting}
  <!-- Connecting State -->
  <div class="connecting-view">
    <div class="loading-ring"></div>
    <h3>{auth.mode === 'qr' ? 'Scan QR code' : auth.mode === 'pair-code' ? 'Enter pair code' : 'Connecting...'}</h3>
    <p>{auth.message ?? 'Setting up encrypted session...'}</p>

    {#if auth.mode === 'qr' && qrSvg}
      <div class="qr-display">
        {@html qrSvg}
      </div>
      <p class="qr-hint">Open WhatsApp → <strong>Linked devices</strong> → <strong>Link a device</strong></p>
    {:else if auth.mode === 'pair-code' && auth.pairCode}
      <button class="pair-code-display" on:click={() => { navigator.clipboard.writeText(auth.pairCode ?? ''); }} aria-label="Copy pair code">
        {auth.pairCode}
        <span class="copy-hint">Tap to copy</span>
      </button>
      <p class="qr-hint">Enter this code in WhatsApp → <strong>Linked devices</strong> → <strong>Link with phone number</strong></p>
    {/if}
  </div>

{:else}
  <!-- Idle State — Pairing Options -->
  <div class="pair-view">
    <div class="tab-bar">
      <button class:active={activeTab === 'qr'} on:click={() => (activeTab = 'qr')}>
        <Icon name="qr_code_2" size="20px" />
        QR Code
      </button>
      <button class:active={activeTab === 'phone'} on:click={() => (activeTab = 'phone')}>
        <Icon name="dialpad" size="20px" />
        Phone Number
      </button>
    </div>

    {#if activeTab === 'qr'}
      <div class="tab-content">
        <div class="pair-illustration">
          <Icon name="qr_code_scanner" size="56px" />
        </div>
        <h3>Scan QR code</h3>
        <p>Open WhatsApp on your phone, go to <strong>Linked devices</strong>, and scan the QR code that will appear.</p>
        <button class="btn btn-primary" disabled={busy} on:click={beginQr}>
          <Icon name="qr_code_2" size="20px" />
          Generate QR Code
        </button>
      </div>
    {:else}
      <div class="tab-content">
        <div class="pair-illustration phone-ill">
          <Icon name="smartphone" size="56px" />
        </div>
        <h3>Link with phone number</h3>
        <p>Enter your phone number with country code. You'll receive a pairing code to enter in WhatsApp.</p>
        <div class="phone-input-group">
          <div class="phone-field">
            <span class="phone-prefix">+</span>
            <input
              bind:value={phoneNumber}
              inputmode="tel"
              autocomplete="tel"
              placeholder="62 812 3456 7890"
              aria-label="Phone number with country code"
            />
          </div>
          <button class="btn btn-primary" disabled={busy || phoneNumber.replace(/[^0-9]/g, '').length < 8} on:click={beginPairCode}>
            Get Code
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .connected-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 5px 12px 5px 8px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--wa-green-dark);
    background: color-mix(in srgb, var(--wa-green) 10%, transparent);
  }

  .badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted, #8696a0);
    transition: background 0.3s;
  }

  .badge-dot.healthy {
    background: var(--wa-green, #25d366);
    box-shadow: 0 0 6px var(--wa-green, #25d366);
  }

  .device-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 12px;
    background: var(--border-color);
  }

  .device-avatar {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    color: var(--wa-green-dark);
    background: color-mix(in srgb, var(--wa-green) 12%, transparent);
    flex-shrink: 0;
  }

  .device-info {
    min-width: 0;
  }

  .device-info strong {
    display: block;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .device-info span {
    display: block;
    margin-top: 1px;
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-rows {
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    background: var(--border-color);
    overflow: hidden;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
  }

  .detail-row + .detail-row {
    border-top: 1px solid var(--paper);
  }

  .detail-label {
    font-size: 0.8125rem;
    color: var(--muted);
    flex-shrink: 0;
  }

  .detail-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--ink);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .detail-value.healthy {
    color: var(--wa-green, #008069);
  }

  .connected-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 4px;
  }

  /* ─── Error View ─── */
  .error-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
    padding: 24px 16px;
  }

  .error-icon-wrap {
    display: grid;
    place-items: center;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    color: #dc3545;
    background: color-mix(in srgb, #dc3545 10%, transparent);
    margin-bottom: 4px;
  }

  .error-view h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--ink, #111b21);
  }

  .error-view p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted, #667781);
    line-height: 1.45;
    max-width: 300px;
  }

  .connecting-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
    padding: 16px 0;
  }

  .loading-ring {
    width: 36px;
    height: 36px;
    border: 2.5px solid var(--border-color);
    border-top-color: var(--wa-green-dark);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 4px;
  }

  .connecting-view h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--ink);
  }

  .connecting-view p {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--muted);
    line-height: 1.4;
  }

  .qr-display {
    width: min(200px, 56vw);
    padding: 12px;
    border-radius: 14px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    margin: 6px 0;
  }

  .qr-display :global(svg) {
    width: 100%;
    height: auto;
    border-radius: 6px;
  }

  .pair-code-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 28px;
    border-radius: 12px;
    color: var(--wa-green-dark);
    font: inherit;
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    background: color-mix(in srgb, var(--wa-green) 8%, transparent);
    margin: 6px 0;
    cursor: pointer;
    -webkit-user-select: text;
    user-select: text;
  }

  .pair-code-display:active {
    background: color-mix(in srgb, var(--wa-green) 8%, var(--paper, white));
  }

  .copy-hint {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--muted);
  }

  .qr-hint {
    max-width: 280px;
    font-size: 0.8rem;
    color: var(--muted, #667781);
    line-height: 1.45;
  }

  .qr-hint strong {
    color: var(--ink, #111b21);
  }

  /* ─── Pair (Idle) View ─── */
  .pair-view {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .tab-bar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 4px;
    border-radius: 14px;
    background: var(--paper, white);
    border: 1px solid var(--border-color, #e9edef);
    margin-bottom: 20px;
  }

  .tab-bar button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 11px 12px;
    border: none;
    border-radius: 11px;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--muted, #667781);
    background: transparent;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tab-bar button.active {
    color: var(--wa-green, #008069);
    background: color-mix(in srgb, var(--wa-green, #25d366) 10%, transparent);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .tab-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
    padding: 8px 0;
    animation: fadeUp 0.2s ease-out;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .pair-illustration {
    display: grid;
    place-items: center;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    color: var(--wa-green, #008069);
    background: color-mix(in srgb, var(--wa-green, #25d366) 10%, transparent);
    margin-bottom: 4px;
  }

  .pair-illustration.phone-ill {
    color: #5b6ef4;
    background: color-mix(in srgb, #5b6ef4 10%, transparent);
  }

  .tab-content h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--ink, #111b21);
  }

  .tab-content p {
    margin: 0;
    font-size: 0.88rem;
    color: var(--muted, #667781);
    line-height: 1.5;
    max-width: 320px;
  }

  .tab-content p strong {
    color: var(--ink, #111b21);
  }

  .phone-input-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 320px;
    margin-top: 4px;
  }

  .phone-field {
    display: flex;
    align-items: center;
    height: 44px;
    border-radius: 22px;
    background: var(--border-color);
    border: 0;
    overflow: hidden;
    transition: box-shadow 0.15s ease;
  }

  .phone-field:focus-within {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--wa-green-dark) 30%, transparent);
  }

  .phone-prefix {
    display: grid;
    place-items: center;
    width: 38px;
    height: 100%;
    color: var(--muted);
    font-size: 0.9375rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .phone-field input {
    flex: 1;
    height: 100%;
    border: none;
    padding: 0 12px;
    color: var(--ink);
    font: inherit;
    font-size: 0.9375rem;
    background: transparent;
    outline: none;
    min-width: 0;
  }

  .phone-field input::placeholder {
    color: var(--muted, #8696a0);
    font-weight: 400;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 16px;
    border: none;
    border-radius: 22px;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.12s ease;
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-primary {
    color: white;
    background: var(--wa-green-dark);
  }

  .btn-primary:not(:disabled):active {
    transform: scale(0.96);
  }

  .btn-outline {
    color: var(--ink);
    background: var(--border-color);
  }

  .btn-outline:active {
    opacity: 0.8;
  }

  .btn-danger {
    color: white;
    background: #dc3545;
  }

  .btn-danger:not(:disabled):active {
    transform: scale(0.96);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
