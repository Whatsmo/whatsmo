<script lang="ts">
  import 'material-symbols/rounded.css';
  import { onMount } from 'svelte';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import AuthPanel from '$lib/components/AuthPanel.svelte';
  import ChatList from '$lib/components/ChatList.svelte';
  import ChatWindow from '$lib/components/ChatWindow.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import StatusPanel from '$lib/components/StatusPanel.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import DevicesPanel from '$lib/components/DevicesPanel.svelte';
  import type { MediaKind } from '$lib/api/types';
  import { connectBridge, connectNotificationActions } from '$lib/api/whatsmo';
  import {
    appState,
    downloadAttachment,
    handleContactNumberChanged,
    handleContactSyncRequested,
    handleContactUpdated,
    ingestHistorySync,
    ingestIncomingMessage,
    refreshAccountDevice,
    requestNotifications,
    resumeSession,
    retryMessage,
    selectedChat,
    selectedMessages,
    selectChat,
    sendAttachment,
    sendMessage,
    setAuth,
    setConnection,
    setHistoryProgress,
    setReceipt,
    setTyping,
    toggleChatArchived,
    toggleChatMuted,
    toggleChatPinned,
    toggleChatRead
  } from '$lib/stores/app';

  let bridgeCleanup: UnlistenFn | undefined;
  let notificationActionCleanup: UnlistenFn | undefined;
  let attachNotice = false;
  let pendingAttachment: { chatId: string; file: File; kind: MediaKind; previewUrl?: string; caption: string; viewOnce: boolean } | null = null;
  let activeScreen: 'chats' | 'chat' | 'updates' | 'settings' | 'devices' = 'chats';
  let suppressHistoryPush = false;



  onMount(() => {
    window.history.replaceState({ screen: activeScreen }, '');

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { screen?: typeof activeScreen } | null;
      suppressHistoryPush = true;
      activeScreen = state?.screen ?? 'chats';
      suppressHistoryPush = false;
    };

    window.addEventListener('popstate', handlePopState);
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
      onContactUpdated: handleContactUpdated,
      onContactNumberChanged: handleContactNumberChanged,
      onContactSyncRequested: handleContactSyncRequested,
      onTyping: setTyping,
      onReceipt: setReceipt
    }).then((cleanup) => {
      bridgeCleanup = cleanup;
      void resumeSession();
    });
    void connectNotificationActions((chatId) => {
      selectChat(chatId);
      activeScreen = 'chat';
      pushNavigationState();
    }).then((cleanup) => {
      notificationActionCleanup = cleanup;
    });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      bridgeCleanup?.();
      notificationActionCleanup?.();
    };
  });

  function pushNavigationState(): void {
    if (suppressHistoryPush) return;
    window.history.pushState({ screen: activeScreen }, '');
  }

  async function handleAttachment(chatId: string, file: File): Promise<void> {
    try {
      pendingAttachment = {
        chatId,
        file,
        kind: mediaKindFromFile(file),
        previewUrl: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : undefined,
        caption: '',
        viewOnce: false
      };
    } catch (error) {
      attachNotice = true;
      window.setTimeout(() => {
        attachNotice = false;
      }, 3200);
      console.error('Attachment send failed', error);
    }
  }

  async function sendPendingAttachment(): Promise<void> {
    if (!pendingAttachment) return;
    const attachment = pendingAttachment;
    pendingAttachment = null;
    try {
      await sendAttachment(attachment.chatId, attachment.file, {
        caption: attachment.caption,
        viewOnce: attachment.viewOnce,
        ptt: attachment.kind === 'audio',
        forcedKind: attachment.kind
      });
    } catch (error) {
      attachNotice = true;
      window.setTimeout(() => {
        attachNotice = false;
      }, 3200);
      console.error('Attachment send failed', error);
    } finally {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
  }

  function cancelPendingAttachment(): void {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    pendingAttachment = null;
  }

  function mediaKindFromFile(file: File): MediaKind {
    if (file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')) return 'sticker';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  }

  function openChat(chatId: string): void {
    selectChat(chatId);
    activeScreen = 'chat';
    pushNavigationState();
  }

  function setScreen(screen: 'chats' | 'updates' | 'settings' | 'devices'): void {
    activeScreen = screen;
    pushNavigationState();
  }
</script>

<svelte:window
  on:keydown={(event) => {
    if (event.key === 'Escape' && activeScreen === 'chat') setScreen('chats');
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
        contact={$appState.contacts.find((contact) => contact.id === $selectedChat.id || contact.lid === $selectedChat.id) ?? null}
        group={$appState.groups[$selectedChat.id] ?? null}
        messages={$selectedMessages}
        onBack={() => setScreen('chats')}
        onSend={sendMessage}
        onRetry={retryMessage}
        onDownloadMedia={downloadAttachment}
        onAttach={handleAttachment}
      />
    {:else}
      <div class="home-screen">
        {#if activeScreen !== 'settings'}
        <header class="app-header">
          <h1>Whatsmo</h1>
          <div class="header-actions">
            <button class="icon-button" aria-label="Camera">
              <Icon name="photo_camera" />
            </button>
            <button class="icon-button" aria-label="More options">
              <Icon name="more_vert" />
            </button>
          </div>
        </header>
        {/if}

        <div class="screen-content">
          {#if activeScreen === 'chats'}
            <ChatList
              chats={$appState.chats}
              historySync={$appState.historySync}
              selectedChatId={$appState.selectedChatId}
              onSelect={openChat}
              onToggleArchive={toggleChatArchived}
              onToggleMute={toggleChatMuted}
              onTogglePin={toggleChatPinned}
              onToggleRead={toggleChatRead}
            />
          {:else if activeScreen === 'updates'}
            <StatusPanel auth={$appState.auth} contacts={$appState.contacts} statuses={$appState.statuses} />
          {:else if activeScreen === 'devices'}
            <DevicesPanel auth={$appState.auth} account={$appState.account} historySync={$appState.historySync} />
          {:else if activeScreen === 'settings'}
            <SettingsPanel />
          {/if}
        </div>

        <nav class="bottom-nav" aria-label="Primary navigation">
          <button class:active={activeScreen === 'chats'} on:click={() => setScreen('chats')}>
            <span><Icon name="chat" /></span> Chats
          </button>
          <button class:active={activeScreen === 'updates'} on:click={() => setScreen('updates')}>
            <span><Icon name="updates" /></span> Updates
          </button>
          <button class:active={activeScreen === 'devices'} on:click={() => setScreen('devices')}>
            <span><Icon name="devices" /></span> Devices
          </button>
          <button class:active={activeScreen === 'settings'} on:click={() => setScreen('settings')}>
            <span><Icon name="settings" /></span> Settings
          </button>
        </nav>
      </div>
    {/if}
  </section>

  {#if attachNotice}
    <div class="toast" role="status">Could not send attachment. Check file type, size, and connection.</div>
  {/if}

  {#if pendingAttachment}
    <div class="attachment-preview" role="dialog" aria-modal="true" aria-label="Preview attachment">
      <section>
        <header>
          <strong>{pendingAttachment.kind === 'document' ? pendingAttachment.file.name : pendingAttachment.kind}</strong>
          <button aria-label="Cancel attachment" on:click={cancelPendingAttachment}>×</button>
        </header>
        <div class="attachment-preview__body">
          {#if pendingAttachment.previewUrl && pendingAttachment.kind === 'image'}
            <img src={pendingAttachment.previewUrl} alt="" />
          {:else if pendingAttachment.previewUrl && pendingAttachment.kind === 'video'}
            <video src={pendingAttachment.previewUrl} controls preload="metadata"><track kind="captions" /></video>
          {:else if pendingAttachment.kind === 'audio'}
            <p>Voice message ready to send</p>
          {:else}
            <p>{pendingAttachment.file.name}</p>
          {/if}
        </div>
        {#if pendingAttachment.kind !== 'sticker' && pendingAttachment.kind !== 'audio'}
          <input bind:value={pendingAttachment.caption} placeholder="Add a caption" />
        {/if}
        {#if pendingAttachment.kind === 'image' || pendingAttachment.kind === 'video'}
          <label><input bind:checked={pendingAttachment.viewOnce} type="checkbox" /> View once</label>
        {/if}
        <button class="send-preview" on:click={sendPendingAttachment}>Send</button>
      </section>
    </div>
  {/if}


</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(:root) {
    --display-font: Roboto, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    --body-font: Roboto, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-right: env(safe-area-inset-right, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-left: env(safe-area-inset-left, 0px);

    /* Material 3 Light Mode Colors (default) */
    --wa-green: #25d366;
    --wa-green-dark: #008069;
    --wa-mint: #d9fdd3;
    --ink: #111b21;
    --muted: #667781;
    --paper: #ffffff;
    --border-color: #e9edef;
    --nav-bg: #ffffff;
    --nav-active: #d8fdd2;
    --message-in: #ffffff;
    --message-out: #d9fdd3;
    --app-bg: #efeae2;
    /* Auth Modal light defaults */
    --modal-bg: var(--paper);
    --auth-bg: #e7f6ef;
    --auth-input-bg: rgba(255, 255, 255, 0.86);
    --auth-input-text: #111b21;
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
    --wa-green: #21c063;
    --wa-green-dark: #00a884;
    --wa-mint: #005c4b;
    --ink: #e9edef;
    --muted: #8696a0;
    --paper: #111b21;
    --border-color: #202c33;
    --nav-bg: #111b21;
    --nav-active: #374248;
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
      --wa-green: #21c063;
      --wa-green-dark: #00a884;
      --wa-mint: #005c4b;
      --ink: #e9edef;
      --muted: #8696a0;
      --paper: #111b21;
      --border-color: #202c33;
      --nav-bg: #111b21;
      --nav-active: #374248;
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
    background: #0b141a;
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
    grid-template-columns: minmax(0, 1fr);
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
    padding: calc(16px + var(--safe-top)) 16px 12px;
    color: var(--ink);
    background: var(--paper);
    z-index: 5;
  }

  .app-header h1 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--wa-green);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    color: var(--ink);
    background: transparent;
    font-size: 1.5rem;
    cursor: pointer;
  }



  .bottom-nav {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 0 12px max(0px, var(--safe-bottom));
    border-top: 1px solid var(--border-color);
    background: var(--nav-bg);
    position: relative;
    z-index: 10;
    min-height: 80px;
  }

  .bottom-nav button {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    border: 0;
    border-radius: 0;
    padding: 12px 6px 16px;
    color: var(--muted);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    background: transparent;
    line-height: 1.2;
    cursor: pointer;
  }

  .bottom-nav button.active {
    color: var(--ink);
  }

  .bottom-nav span {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 32px;
    font-size: 1.5rem;
    border-radius: 16px;
    transition: background-color 0.2s ease;
  }

  .bottom-nav button.active span {
    background-color: var(--nav-active);
  }



  .toast {
    position: fixed;
    right: 16px;
    bottom: 16px;
    max-width: min(360px, calc(100vw - 32px));
    padding: 14px 16px;
    border-radius: 8px;
    color: var(--paper);
    font-size: 0.9rem;
    background: var(--ink);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .attachment-preview {
    position: fixed;
    inset: 0;
    z-index: 35;
    display: grid;
    place-items: end center;
    background: rgba(0, 0, 0, 0.58);
    backdrop-filter: blur(8px);
  }

  .attachment-preview section {
    display: grid;
    gap: 12px;
    width: min(100%, 430px);
    max-height: 86vh;
    overflow-y: auto;
    border-radius: 28px 28px 0 0;
    padding: 16px 16px max(18px, calc(14px + var(--safe-bottom)));
    color: var(--ink);
    background: var(--paper);
  }

  .attachment-preview header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .attachment-preview header button {
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 999px;
    color: var(--ink);
    font-size: 1.5rem;
    background: var(--nav-active);
  }

  .attachment-preview__body {
    display: grid;
    place-items: center;
    min-height: 180px;
    border-radius: 18px;
    overflow: hidden;
    background: var(--nav-active);
  }

  .attachment-preview__body img,
  .attachment-preview__body video {
    width: 100%;
    max-height: 46vh;
    object-fit: contain;
  }

  .attachment-preview > section > input:not([type]) {
    min-height: 44px;
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 0 12px;
    color: var(--ink);
    background: transparent;
    font: inherit;
  }

  .attachment-preview label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-weight: 850;
  }

  .send-preview {
    min-height: 48px;
    border: 0;
    border-radius: 999px;
    color: white;
    font: inherit;
    font-weight: 950;
    background: var(--wa-green);
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
  }
</style>
