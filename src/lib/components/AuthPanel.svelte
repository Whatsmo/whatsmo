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

  $: if (auth.qrCode) {
    QRCode.toString(auth.qrCode, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#061f1a',
        light: '#f7fff6'
      }
    }).then((svg) => {
      qrSvg = svg;
    });
  } else {
    qrSvg = '';
  }

  onMount(() => {
    void requestNotifications();
  });

  async function beginQr(): Promise<void> {
    busy = true;
    setAuth({ mode: 'connecting', message: 'Starting encrypted WhatsApp Web session...' });
    try {
      setAuth(await startQrAuth());
    } finally {
      busy = false;
    }
  }

  async function beginPairCode(): Promise<void> {
    const cleaned = phoneNumber.replace(/[^0-9]/g, '');
    if (cleaned.length < 8) {
      setAuth({ mode: 'error', message: 'Enter a phone number with country code, for example 62812...' });
      return;
    }

    busy = true;
    setAuth({ mode: 'connecting', phoneNumber: cleaned, message: 'Requesting WhatsApp pair code...' });
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
      'Unlink this Whatsmo companion from WhatsApp? You will need to pair again after this.'
    );
    if (!confirmed) return;

    busy = true;
    setAuth({ mode: 'connecting', message: 'Unlinking this companion from WhatsApp...' });
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

<section class:connected={auth.mode === 'connected'} class:error={auth.mode === 'error'} class="auth-strip" aria-label="WhatsApp pairing">
  <div class="link-icon" aria-hidden="true">
    {#if auth.mode === 'error'}
      <Icon name="error_outline" />
    {:else if auth.mode === 'connecting' || busy}
      <span class="spinner"></span>
    {:else}
      ⌁
    {/if}
  </div>
  <div class="auth-copy">
    <strong>
      {#if auth.mode === 'error'}
        Pairing failed
      {:else if auth.mode === 'connecting'}
        Connecting
      {:else}
        {auth.mode === 'connected' ? 'Linked device active' : 'Link this device'}
      {/if}
    </strong>
    <span>{auth.message ?? 'Use QR or phone pairing to connect WhatsApp.'}</span>
  </div>

  {#if auth.mode === 'connected'}
    <div class="account-details" aria-label="Account and device details">
      <div>
        <span>Account</span>
        <strong>{account?.pushName ?? account?.phoneJid ?? 'Linked account'}</strong>
      </div>
      <div>
        <span>Phone JID</span>
        <strong>{account?.phoneJid ?? 'Not available yet'}</strong>
      </div>
      <div>
        <span>LID</span>
        <strong>{account?.lidJid ?? 'Not available yet'}</strong>
      </div>
      <div>
        <span>Device</span>
        <strong>{account?.deviceName ?? 'Whatsmo mobile companion'}</strong>
      </div>
      <div>
        <span>Health</span>
        <strong class:healthy={account?.connected && account?.loggedIn}>
          {account?.connected && account?.loggedIn
            ? 'Connected + logged in'
            : account?.running
              ? 'Running, waiting for auth'
              : 'Stopped'}
        </strong>
      </div>
    </div>

    <div class="session-actions">
      <button class="secondary-button" disabled={busy} on:click={disconnectLocal}>Stop locally</button>
      <button class="danger-button" disabled={busy} on:click={unlinkDevice}>Unlink</button>
    </div>
  {:else if auth.mode === 'error'}
    <div class="auth-controls">
      <button class="secondary-button" on:click={resetAuth}>Try again</button>
    </div>
  {:else if auth.mode !== 'connecting'}
    <div class="auth-controls">
      <button class="qr-button" disabled={busy} on:click={beginQr}>QR</button>
      <div class="phone-entry">
        <input
          bind:value={phoneNumber}
          inputmode="tel"
          autocomplete="tel"
          placeholder="62..."
          aria-label="Phone number with country code"
        />
        <button disabled={busy} on:click={beginPairCode}>Code</button>
      </div>
    </div>
  {/if}

  {#if auth.mode === 'qr' && qrSvg}
    <div class="qr-wrap">
      {@html qrSvg}
      <p>WhatsApp → Linked devices → Link a device</p>
    </div>
  {:else if auth.mode === 'pair-code' && auth.pairCode}
    <div class="pair-code" aria-label="Pair code">{auth.pairCode}</div>
  {/if}
</section>

<style>
  .auth-strip {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    margin: 0;
    padding: 12px;
    border-radius: 18px;
    color: var(--ink, #0b211a);
    background: var(--auth-bg, #e7f6ef);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.06);
  }

  .auth-strip.connected {
    background: var(--auth-bg, #d9fdd3);
  }

  .auth-strip.error {
    background: #fce8e6;
  }

  .auth-strip.error .link-icon {
    background: #ea4335;
  }

  .link-icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    color: white;
    font-weight: 900;
    background: var(--wa-green, #008069);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .auth-copy {
    min-width: 0;
  }

  .auth-copy strong,
  .auth-copy span {
    display: block;
  }

  .auth-copy strong {
    font-size: 0.92rem;
    font-weight: 900;
  }

  .auth-copy span {
    margin-top: 2px;
    color: var(--muted, #4d5e58);
    font-size: 0.78rem;
    line-height: 1.3;
  }

  button,
  input {
    min-height: 38px;
    border: 0;
    border-radius: 999px;
    font: inherit;
  }

  button {
    cursor: pointer;
    font-weight: 850;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.58;
  }

  .auth-controls {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    margin-top: 4px;
  }

  .qr-button,
  .phone-entry button {
    padding: 0 14px;
    color: white;
    background: var(--wa-green, #008069);
  }

  .session-actions {
    grid-column: 1 / -1;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 5px;
  }

  .account-details {
    grid-column: 1 / -1;
    display: grid;
    gap: 8px;
    margin-top: 6px;
    padding: 10px;
    border-radius: 16px;
    background: var(--auth-card-bg, rgba(255, 255, 255, 0.72));
  }

  .account-details div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .account-details span {
    color: var(--muted, #667781);
    font-size: 0.7rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .account-details strong {
    overflow: hidden;
    color: var(--ink, #0b211a);
    font-size: 0.8rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-details strong.healthy {
    color: var(--wa-green, #008069);
  }

  .secondary-button,
  .danger-button {
    padding: 0 14px;
  }

  .secondary-button {
    color: var(--wa-green-dark, #075e54);
    background: var(--auth-card-bg, white);
  }

  .danger-button {
    color: white;
    background: #b3261e;
  }

  .phone-entry {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    min-width: 0;
  }

  input {
    width: 100%;
    min-width: 0;
    padding: 0 12px;
    color: var(--auth-input-text, #0b211a);
    background: var(--auth-input-bg, rgba(255, 255, 255, 0.86));
    outline: none;
  }

  input::placeholder {
    color: var(--muted, #86958f);
  }

  .qr-wrap {
    grid-column: 1 / -1;
    display: grid;
    justify-items: center;
    gap: 8px;
    margin-top: 6px;
    padding: 12px;
    border-radius: 16px;
    color: var(--muted, #667781);
    background: var(--auth-card-bg, white);
  }

  .qr-wrap :global(svg) {
    width: min(170px, 58vw);
    height: auto;
    border-radius: 12px;
  }

  .pair-code {
    grid-column: 1 / -1;
    margin-top: 6px;
    padding: 12px;
    border-radius: 16px;
    color: var(--wa-green, #008069);
    font-size: 1.8rem;
    font-weight: 950;
    letter-spacing: 0.12em;
    text-align: center;
    background: var(--auth-card-bg, white);
  }
</style>
