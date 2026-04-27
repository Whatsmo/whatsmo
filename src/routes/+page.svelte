<script lang="ts">
  import { onMount } from 'svelte';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import AuthPanel from '$lib/components/AuthPanel.svelte';
  import ChatList from '$lib/components/ChatList.svelte';
  import ChatWindow from '$lib/components/ChatWindow.svelte';
  import StatusPanel from '$lib/components/StatusPanel.svelte';
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
  let activeScreen: 'chats' | 'chat' | 'updates' = 'chats';

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

<main class="app-stage">
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

        <div class="screen-content">
          {#if $appState.historySync}
            <section class:active={$appState.historySync.active} class="history-sync-banner" aria-live="polite">
              <strong>{$appState.historySync.active ? 'Syncing history' : 'History sync'}</strong>
              <span>{$appState.historySync.message}</span>
            </section>
          {/if}

          {#if activeScreen === 'chats'}
            <ChatList chats={$appState.chats} selectedChatId={$appState.selectedChatId} onSelect={openChat} />
          {:else}
            <StatusPanel auth={$appState.auth} contacts={$appState.contacts} />
          {/if}
        </div>

        <nav class="bottom-nav" aria-label="Primary navigation">
          <button class:active={activeScreen === 'chats'} on:click={() => (activeScreen = 'chats')}>
            <span>●</span> Chats
          </button>
          <button class:active={activeScreen === 'updates'} on:click={() => (activeScreen = 'updates')}>
            <span>◎</span> Updates
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
    --wa-green: #008069;
    --wa-green-dark: #075e54;
    --wa-mint: #d9fdd3;
    --ink: #101f1b;
    --muted: #667781;
    --paper: #fbfbf6;
    color: #061f1a;
    font-family: var(--body-font);
    background: #101815;
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
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-height: 0;
    background: var(--paper);
  }

  .screen-content {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
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
    padding: calc(14px + var(--safe-top)) 18px 18px;
    color: white;
    background: var(--wa-green);
  }

  .app-header h1 {
    margin: 0;
  }

  .app-header h1 {
    font-size: 1.6rem;
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  .link-button {
    min-height: 38px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    padding: 0 14px;
    color: white;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 950;
    background: rgba(255, 255, 255, 0.14);
  }

  .link-button.connected {
    color: #073b2f;
    background: #d9fdd3;
    border-color: #d9fdd3;
  }

  .bottom-nav {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
    padding: 8px 12px 12px;
    border-top: 1px solid #edf0eb;
    background: rgba(251, 251, 246, 0.96);
  }

  .history-sync-banner {
    display: grid;
    gap: 3px;
    margin: -2px 12px 10px;
    padding: 10px 12px;
    border-radius: 16px;
    color: #075e54;
    background: #eef7f3;
  }

  .history-sync-banner.active {
    background: #d9fdd3;
  }

  .history-sync-banner strong {
    font-size: 0.82rem;
  }

  .history-sync-banner span {
    color: #4d5e58;
    font-size: 0.76rem;
    line-height: 1.35;
  }

  .bottom-nav button {
    display: grid;
    gap: 2px;
    justify-items: center;
    align-content: center;
    min-height: 54px;
    width: 100%;
    border: 0;
    border-radius: 18px;
    padding: 0 6px;
    color: #667781;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 850;
    background: transparent;
    line-height: 1.1;
  }

  .bottom-nav button.active {
    color: var(--wa-green);
    background: #e7f6ef;
  }

  .bottom-nav span {
    display: block;
    height: 18px;
    font-size: 1rem;
    line-height: 18px;
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
    background: var(--paper);
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
    color: #54645f;
    font: inherit;
    font-size: 1.45rem;
    font-weight: 700;
    background: #eef2ee;
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
      padding-bottom: max(12px, calc(8px + var(--safe-bottom)));
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
