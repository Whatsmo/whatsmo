<script lang="ts">
  import { onMount } from 'svelte';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import AuthPanel from '$lib/components/AuthPanel.svelte';
  import ChatList from '$lib/components/ChatList.svelte';
  import ChatWindow from '$lib/components/ChatWindow.svelte';
  import StatusPanel from '$lib/components/StatusPanel.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import { connectBridge } from '$lib/api/whatsmo';
  import {
    appState,
    ingestHistorySync,
    ingestIncomingMessage,
    refreshAccountDevice,
    requestNotifications,
    resumeSession,
    retryMessage,
    selectedChat,
    selectedMessages,
    selectChat,
    sendMessage,
    setAuth,
    setConnection,
    setHistoryProgress,
    setReceipt,
    setTyping
  } from '$lib/stores/app';

  let bridgeCleanup: UnlistenFn | undefined;
  let attachNotice = false;
  let authModalOpen = false;
  let activeScreen: 'chats' | 'chat' | 'updates' | 'settings' = 'chats';

  $: linkLabel =
    $appState.auth.mode === 'connected'
      ? 'Linked'
      : $appState.auth.mode === 'connecting'
        ? 'Pairing'
        : 'Link';
  $: linkModalTitle = $appState.auth.mode === 'connected' ? 'Linked account' : 'Link this device';

  onMount(() => {
    void requestNotifications();
    void connectBridge({
      onAuth: (payload) => {
        setAuth(payload);
        if (payload.mode === 'connected') void refreshAccountDevice();
      },
      onConnection: (payload) => {
        setConnection(payload);
        if (payload.connected) void refreshAccountDevice();
      },
      onMessage: ingestIncomingMessage,
      onHistorySync: ingestHistorySync,
      onHistoryProgress: setHistoryProgress,
      onTyping: setTyping,
      onReceipt: setReceipt
    }).then((cleanup) => {
      bridgeCleanup = cleanup;
      void resumeSession();
    });

    return () => {
      bridgeCleanup?.();
    };
  });

  function showAttachNotice(): void {
    attachNotice = true;
    window.setTimeout(() => {
      attachNotice = false;
    }, 2600);
  }

  function openChat(chatId: string): void {
    selectChat(chatId);
    activeScreen = 'chat';
  }

  function closeAuthModal(): void {
    authModalOpen = false;
  }
</script>

<svelte:window
  on:keydown={(event) => {
    if (event.key === 'Escape') closeAuthModal();
  }}
/>

<svelte:head>
  <title>Whatsmo · Rust-powered WhatsApp mobile</title>
  <meta
    name="description"
    content="Android-first WhatsApp companion app using Tauri, SvelteKit, Bun, and whatsapp-rust."
  />
</svelte:head>

<main class="app-stage" data-theme={$appState.theme}>
  <section class="device" aria-label="Whatsmo mobile app">
    {#if activeScreen === 'chat' && $selectedChat}
      <ChatWindow
        chat={$selectedChat}
        messages={$selectedMessages}
        onBack={() => (activeScreen = 'chats')}
        onSend={sendMessage}
        onRetry={retryMessage}
        onAttach={showAttachNotice}
      />
    {:else}
      <div class="home-screen">
        {#if activeScreen !== 'settings'}
        <header class="app-header">
          <h1>Whatsmo</h1>
          <button
            class:connected={$appState.auth.mode === 'connected'}
            class="link-button"
            aria-haspopup="dialog"
            aria-expanded={authModalOpen}
            on:click={() => (authModalOpen = true)}
          >
            {linkLabel}
          </button>
        </header>
        {/if}

        <div class="screen-content">
          {#if $appState.historySync && activeScreen !== 'settings'}
            <section class:active={$appState.historySync.active} class="history-sync-banner" aria-live="polite">
              <strong>{$appState.historySync.active ? 'Syncing history' : 'History sync'}</strong>
              <span>{$appState.historySync.message}</span>
            </section>
          {/if}

          {#if activeScreen === 'chats'}
            <ChatList chats={$appState.chats} selectedChatId={$appState.selectedChatId} onSelect={openChat} />
          {:else if activeScreen === 'settings'}
            <SettingsPanel />
          {:else}
            <StatusPanel auth={$appState.auth} contacts={$appState.contacts} />
          {/if}
        </div>

        <nav class="bottom-nav" aria-label="Primary navigation">
          <button class:active={activeScreen === 'chats'} on:click={() => (activeScreen = 'chats')}>
            <span class="material-symbols-rounded">chat</span> Chats
          </button>
          <button class:active={activeScreen === 'updates'} on:click={() => (activeScreen = 'updates')}>
            <span class="material-symbols-rounded">data_usage</span> Updates
          </button>
          <button class:active={activeScreen === 'settings'} on:click={() => (activeScreen = 'settings')}>
            <span class="material-symbols-rounded">settings</span> Settings
          </button>
        </nav>
      </div>
    {/if}
  </section>

  {#if attachNotice}
    <div class="toast" role="status">Media picker is queued for the next backend slice.</div>
  {/if}

  {#if authModalOpen}
    <div class="modal-backdrop">
      <button class="modal-dismiss" aria-label="Close link dialog" on:click={closeAuthModal}></button>
      <div
        class="link-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-modal-title"
        tabindex="-1"
      >
        <header class="link-modal__header">
          <h2 id="link-modal-title">{linkModalTitle}</h2>
          <button aria-label="Close link dialog" on:click={closeAuthModal}>×</button>
        </header>
        <AuthPanel auth={$appState.auth} account={$appState.account} />
      </div>
    </div>
  {/if}
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(:root) {
    --display-font: ui-rounded, 'Avenir Next Rounded Std', 'Trebuchet MS', sans-serif;
    --body-font: ui-rounded, 'Avenir Next Rounded Std', 'Trebuchet MS', sans-serif;
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-right: env(safe-area-inset-right, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-left: env(safe-area-inset-left, 0px);

    /* Material 3 Light Mode Colors (default) */
    --wa-green: #008069;
    --wa-green-dark: #075e54;
    --wa-mint: #d9fdd3;
    --ink: #101f1b;
    --muted: #667781;
    --paper: #fbfbf6;
    --border-color: #edf0eb;
    --nav-bg: #fbfbf6;
    --nav-active: #e7f6ef;
    --message-in: white;
    --message-out: #d9fdd3;
    --app-bg: #efe7dd;
    /* Auth Modal light defaults */
    --modal-bg: var(--paper);
    --auth-bg: #e7f6ef;
    --auth-input-bg: rgba(255, 255, 255, 0.86);
    --auth-input-text: #0b211a;
    --auth-card-bg: rgba(255, 255, 255, 0.72);

    color: var(--ink);
    font-family: var(--body-font);
    background: var(--app-bg);
    /* Modal animation styles for Settings/Updates */
    --modal-z: 100;
    /* Mobile UI Tweaks */
    -webkit-tap-highlight-color: transparent;
  }

  /* Material 3 Dark Mode Colors */
  .app-stage[data-theme="dark"] {
    --wa-green: #25d366;
    --wa-green-dark: #81cbb4;
    --wa-mint: #005c4b;
    --ink: #e9edef;
    --muted: #8696a0;
    --paper: #0b141a;
    --border-color: #202c33;
    --nav-bg: #111b21;
    --nav-active: #202c33;
    --message-in: #202c33;
    --message-out: #005c4b;
    --app-bg: #0b141a;
    /* Auth Modal dark adjustments */
    --modal-bg: #111b21;
    --auth-bg: #202c33;
    --auth-input-bg: rgba(255, 255, 255, 0.1);
    --auth-input-text: #e9edef;
    --auth-card-bg: rgba(255, 255, 255, 0.05);
  }

  @media (prefers-color-scheme: dark) {
    .app-stage[data-theme="system"] {
      --wa-green: #25d366;
      --wa-green-dark: #81cbb4;
      --wa-mint: #005c4b;
      --ink: #e9edef;
      --muted: #8696a0;
      --paper: #0b141a;
      --border-color: #202c33;
      --nav-bg: #111b21;
      --nav-active: #202c33;
      --message-in: #202c33;
      --message-out: #005c4b;
      --app-bg: #0b141a;
      /* Auth Modal dark adjustments */
      --modal-bg: #111b21;
      --auth-bg: #202c33;
      --auth-input-bg: rgba(255, 255, 255, 0.1);
      --auth-input-text: #e9edef;
      --auth-card-bg: rgba(255, 255, 255, 0.05);
    }
  }

  :global(body) {
    min-width: 320px;
    min-height: 100vh;
    margin: 0;
    background:
      radial-gradient(circle at 50% -10%, rgba(37, 211, 102, 0.32), transparent 34rem),
      radial-gradient(circle at 16% 92%, rgba(0, 128, 105, 0.22), transparent 28rem),
      linear-gradient(145deg, #07110f, #17211e 55%, #070b0a);
  }

  :global(button),
  :global(input) {
    font-family: inherit;
  }

  :global(::selection) {
    color: #061f1a;
    background: #25d366;
  }

  .app-stage {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: max(16px, var(--safe-top)) max(12px, var(--safe-right)) max(16px, var(--safe-bottom)) max(12px, var(--safe-left));
  }

  .device {
    display: grid;
    grid-template-rows: 1fr;
    width: min(100%, 430px);
    height: min(920px, calc(100vh - 28px));
    min-height: 680px;
    overflow: hidden;
    border: 10px solid #050807;
    border-radius: 46px;
    background: var(--paper);
    box-shadow:
      0 42px 120px rgba(0, 0, 0, 0.48),
      inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .home-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--paper);
  }

  .screen-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
    z-index: 1;
  }

  .screen-content :global(.chat-list),
  .screen-content :global(.status-panel) {
    flex: 1 1 auto;
    min-height: 0;
  }

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: calc(14px + var(--safe-top)) 18px 14px;
    color: var(--ink);
    background: var(--paper);
    z-index: 5;
  }

  .app-header h1 {
    margin: 0;
  }

  .app-header h1 {
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--wa-green);
  }

  .link-button {
    min-height: 38px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    padding: 0 14px;
    color: var(--ink);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 700;
    background: transparent;
    cursor: pointer;
  }

  .link-button.connected {
    color: var(--wa-green-dark, #073b2f);
    background: var(--nav-active, #d9fdd3);
    border-color: var(--nav-active, #d9fdd3);
  }

  .bottom-nav {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 8px 12px max(12px, var(--safe-bottom));
    border-top: 1px solid var(--border-color);
    background: var(--nav-bg);
    position: relative;
    z-index: 10;
  }

  .bottom-nav button {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    width: 100%;
    border: 0;
    border-radius: 12px;
    padding: 6px;
    color: var(--muted);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    background: transparent;
    line-height: 1.1;
    transition: color 0.15s ease, background-color 0.15s ease;
    cursor: pointer;
  }

  .bottom-nav button.active {
    color: var(--wa-green);
  }

  .bottom-nav span {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 32px;
    font-size: 1.6rem;
    border-radius: 16px;
    transition: background-color 0.2s ease;
  }

  .bottom-nav button.active span {
    background-color: var(--nav-active);
  }

  .history-sync-banner {
    display: grid;
    gap: 3px;
    margin: 8px 12px 10px;
    padding: 12px 14px;
    border-radius: 12px;
    color: #075e54;
    background: #eef7f3;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }

  .history-sync-banner.active {
    background: #d9fdd3;
  }

  .history-sync-banner strong {
    font-size: 0.85rem;
  }

  .history-sync-banner span {
    color: #4d5e58;
    font-size: 0.8rem;
    line-height: 1.35;
  }

  .toast {
    position: fixed;
    right: 22px;
    bottom: 22px;
    max-width: min(360px, calc(100vw - 44px));
    padding: 14px 16px;
    border-radius: 18px;
    color: #0b211a;
    font-weight: 900;
    background: var(--wa-mint);
    box-shadow: 0 18px 46px rgba(0, 0, 0, 0.2);
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: end center;
    padding: max(18px, var(--safe-top)) max(12px, var(--safe-right)) max(18px, var(--safe-bottom)) max(12px, var(--safe-left));
    background: rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(8px);
  }

  .link-modal {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 14px;
    width: min(100%, 430px);
    max-height: min(78vh, 720px);
    overflow-y: auto;
    border-radius: 30px 30px 26px 26px;
    padding: 16px;
    background: var(--modal-bg, var(--paper));
    box-shadow: 0 28px 90px rgba(0, 0, 0, 0.38);
    animation: modal-rise 180ms ease-out both;
  }

  .modal-dismiss {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: transparent;
  }

  .link-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .link-modal__header h2 {
    margin: 0;
  }

  .link-modal__header h2 {
    color: var(--ink);
    font-size: 1.3rem;
    letter-spacing: -0.03em;
  }

  .link-modal__header button {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 999px;
    color: var(--muted);
    font: inherit;
    font-size: 1.45rem;
    font-weight: 700;
    background: var(--nav-active);
  }

  @keyframes modal-rise {
    from {
      opacity: 0;
      transform: translateY(18px) scale(0.98);
    }
  }

  @media (max-width: 520px) {
    .app-stage {
      padding: 0;
    }

    .device {
      width: 100%;
      height: 100vh;
      min-height: 100vh;
      border: 0;
      border-radius: 0;
    }

    .bottom-nav {
      padding-bottom: max(16px, calc(8px + var(--safe-bottom)));
    }

    .modal-backdrop {
      place-items: end stretch;
      padding: 0;
    }

    .link-modal {
      width: 100%;
      max-height: 86vh;
      border-radius: 28px 28px 0 0;
      padding-bottom: max(16px, calc(16px + var(--safe-bottom)));
    }
  }
</style>
