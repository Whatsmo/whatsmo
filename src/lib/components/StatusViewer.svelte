<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { ChatMessage } from '$lib/api/types';
  import Icon from './Icon.svelte';

  export let statuses: ChatMessage[] = [];
  export let contactName: string = 'Status';
  export let avatarGradient: string = 'linear-gradient(135deg, #25d366, #128c7e)';

  const dispatch = createEventDispatcher<{ close: void }>();

  let currentIndex = 0;
  let progress = 0;
  let paused = false;
  let animationFrameId: number;
  let lastTime: number;
  const DURATION = 5000; // 5 seconds per status

  $: currentStatus = statuses[currentIndex];

  function startAnimation() {
    lastTime = performance.now();
    animationFrameId = requestAnimationFrame(updateProgress);
  }

  function updateProgress(time: number) {
    if (!paused) {
      const delta = time - lastTime;
      progress += (delta / DURATION) * 100;

      if (progress >= 100) {
        next();
      }
    }
    lastTime = time;
    if (progress < 100 && currentIndex < statuses.length) {
      animationFrameId = requestAnimationFrame(updateProgress);
    }
  }

  function next() {
    if (currentIndex < statuses.length - 1) {
      currentIndex++;
      progress = 0;
    } else {
      dispatch('close');
    }
  }

  function prev() {
    if (currentIndex > 0) {
      currentIndex--;
      progress = 0;
    } else {
      progress = 0;
    }
  }

  function handlePointerDown() {
    paused = true;
  }

  function handlePointerUp(e: PointerEvent) {
    paused = false;
    lastTime = performance.now(); // Reset lastTime so delta is small
    // Simple click/tap detection vs hold
    const screenWidth = window.innerWidth;
    if (e.clientX < screenWidth * 0.3) {
      prev();
    } else {
      next();
    }
  }

  onMount(() => {
    startAnimation();
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  });

</script>

<div class="status-viewer" role="dialog" aria-modal="true" aria-label="{contactName}'s status">
  <div class="progress-container">
    {#each statuses as _, i}
      <div class="progress-segment">
        <div 
          class="progress-fill" 
          style="width: {i < currentIndex ? '100%' : i === currentIndex ? progress + '%' : '0%'}"
        ></div>
      </div>
    {/each}
  </div>

  <header class="viewer-header">
    <div class="contact-info">
      <div class="avatar" style="background: {avatarGradient}"></div>
      <div class="name-time">
        <span class="name">{contactName}</span>
        <span class="time">
          {#if currentStatus}
            {new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(currentStatus.timestamp))}
          {/if}
        </span>
      </div>
    </div>
    <button class="close-btn" on:click={() => dispatch('close')} aria-label="Close">
      <Icon name="arrow-back" size="24px" />
    </button>
  </header>

  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div 
    class="viewer-content" 
    on:pointerdown={handlePointerDown} 
    on:pointerup={handlePointerUp}
    on:pointerleave={() => { paused = false; }}
  >
    {#if currentStatus}
      {#if currentStatus.media}
        {#if currentStatus.media.kind === 'image'}
          <img src={currentStatus.media.cachedDataUrl || currentStatus.media.directPath} alt="Status" />
        {:else if currentStatus.media.kind === 'video'}
          <video src={currentStatus.media.cachedDataUrl || currentStatus.media.directPath} autoplay muted playsinline loop></video>
        {:else}
          <div class="unsupported">Unsupported media type: {currentStatus.media.kind}</div>
        {/if}
        {#if currentStatus.text}
          <div class="caption">{currentStatus.text}</div>
        {/if}
      {:else if currentStatus.text}
        <!-- Text status -->
        <div class="text-status-container">
          <p class="text-status" style="font-size: {currentStatus.text.length < 50 ? '2rem' : '1.2rem'}">
            {currentStatus.text}
          </p>
        </div>
      {:else}
         <div class="unsupported">Empty status</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .status-viewer {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #000;
    display: flex;
    flex-direction: column;
    color: #fff;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }

  .progress-container {
    display: flex;
    gap: 4px;
    padding: max(16px, env(safe-area-inset-top)) 8px 8px 8px;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
  }

  .progress-segment {
    flex: 1;
    height: 3px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #fff;
    border-radius: 2px;
  }

  .viewer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: max(24px, calc(env(safe-area-inset-top) + 16px)) 16px 16px;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%);
  }

  .contact-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }

  .name-time {
    display: flex;
    flex-direction: column;
  }

  .name {
    font-weight: 600;
    font-size: 1rem;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }

  .time {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.8);
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #fff;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }

  .viewer-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    position: relative;
    touch-action: none; /* Prevent scroll on touch devices */
  }

  .viewer-content img,
  .viewer-content video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .caption {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 24px 16px max(24px, env(safe-area-inset-bottom));
    background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%);
    text-align: center;
    font-size: 1.1rem;
    line-height: 1.4;
  }

  .text-status-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    background-color: var(--status-bg-color, #ffb300); /* A fallback color, should ideally use the one from status if available */
  }

  .text-status {
    text-align: center;
    font-family: var(--display-font);
    line-height: 1.3;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .unsupported {
    padding: 20px;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
  }
</style>
