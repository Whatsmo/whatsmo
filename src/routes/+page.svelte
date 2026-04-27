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
    ingestIncomingMessage,
    requestNotifications,
    resumeSession,
    selectedChat,
    selectedMessages,
    selectChat,
    sendMessage,
    setAuth,
    setConnection,
    setReceipt,
    setTyping
  } from '$lib/stores/app';

  let bridgeCleanup: UnlistenFn | undefined;
  let attachNotice = false;
  let activeScreen: 'chats' | 'chat' | 'updates' = 'chats';

  onMount(() => {
    void requestNotifications();
    void connectBridge({
      onAuth: setAuth,
      onConnection: setConnection,
      onMessage: ingestIncomingMessage,
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
</script>

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
        onAttach={showAttachNotice}
      />
    {:else}
      <div class="home-screen">
        <header class="app-header">
          <h1>Whatsmo</h1>
          <span class:online={$appState.auth.mode === 'connected'} class="connection-dot" aria-label="Connection status"></span>
        </header>

        <AuthPanel auth={$appState.auth} />

        {#if activeScreen === 'chats'}
          <ChatList chats={$appState.chats} selectedChatId={$appState.selectedChatId} onSelect={openChat} />
        {:else}
          <StatusPanel auth={$appState.auth} contacts={$appState.contacts} />
        {/if}

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
    grid-template-rows: auto auto 1fr auto;
    min-height: 0;
    background: var(--paper);
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

  .connection-dot {
    width: 13px;
    height: 13px;
    border: 2px solid rgba(255, 255, 255, 0.7);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.28);
  }

  .connection-dot.online {
    border-color: #d9fdd3;
    background: #25d366;
    box-shadow: 0 0 0 5px rgba(37, 211, 102, 0.18);
  }

  .bottom-nav {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
    padding: 8px 12px 12px;
    border-top: 1px solid #edf0eb;
    background: rgba(251, 251, 246, 0.96);
  }

  .bottom-nav button {
    display: grid;
    gap: 2px;
    justify-items: center;
    border: 0;
    border-radius: 18px;
    padding: 8px 6px;
    color: #667781;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 850;
    background: transparent;
  }

  .bottom-nav button.active {
    color: var(--wa-green);
    background: #e7f6ef;
  }

  .bottom-nav span {
    font-size: 1rem;
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
  }
</style>
