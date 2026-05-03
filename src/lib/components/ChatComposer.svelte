<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Icon from './Icon.svelte';

  const dispatch = createEventDispatcher<{
    send: string;
    attach: File;
    typing: void;
  }>();

  let draft = '';
  let imageInput: HTMLInputElement;
  let videoInput: HTMLInputElement;
  let documentInput: HTMLInputElement;
  let stickerInput: HTMLInputElement;
  let showAttachSheet = false;
  let mediaRecorder: MediaRecorder | null = null;
  let isRecording = false;

  function submit(): void {
    const text = draft.trim();
    if (!text) {
      return;
    }

    dispatch('send', text);
    draft = '';
  }

  function openFilePicker(input: HTMLInputElement): void {
    showAttachSheet = false;
    input.click();
  }

  function handleFileChange(event: Event): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      dispatch('attach', file);
    }
  }

  async function toggleRecording(): Promise<void> {
    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: BlobPart[] = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      isRecording = false;
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
      dispatch('attach', new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }));
    };
    isRecording = true;
    mediaRecorder.start();
  }
</script>

<form class="composer" on:submit|preventDefault={submit}>
  <div class="input-wrapper">
    <button type="button" class="ghost" aria-label="Emoji">
      <Icon name="mood" />
    </button>
    <input bind:value={draft} placeholder="Message" aria-label="Message" on:input={() => dispatch('typing')} />
    <button type="button" class="ghost" aria-label="Attach media" on:click={() => (showAttachSheet = !showAttachSheet)}>
      <Icon name="attach_file" />
    </button>
    <input
      bind:this={imageInput}
      class="file-input"
      type="file"
      accept="image/*"
      on:change={handleFileChange}
      aria-label="Choose image"
      tabindex="-1"
    />
    <input bind:this={videoInput} class="file-input" type="file" accept="video/*" on:change={handleFileChange} aria-label="Choose video" tabindex="-1" />
    <input bind:this={documentInput} class="file-input" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z" on:change={handleFileChange} aria-label="Choose document" tabindex="-1" />
    <input bind:this={stickerInput} class="file-input" type="file" accept="image/webp,.webp" on:change={handleFileChange} aria-label="Choose sticker" tabindex="-1" />
  </div>
  <button type={draft.trim() ? 'submit' : 'button'} class:recording={isRecording} class="send" aria-label={draft.trim() ? "Send message" : "Voice message"} on:click={draft.trim() ? undefined : toggleRecording}>
    <Icon name={draft.trim() ? "send" : "mic"} />
  </button>
  {#if showAttachSheet}
    <div class="attach-sheet">
      <button type="button" on:click={() => openFilePicker(imageInput)}>Image</button>
      <button type="button" on:click={() => openFilePicker(videoInput)}>Video</button>
      <button type="button" on:click={() => openFilePicker(documentInput)}>Document</button>
      <button type="button" on:click={() => openFilePicker(stickerInput)}>Sticker</button>
    </div>
  {/if}
</form>

<style>
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 4px 10px 8px;
    background: transparent;
    position: relative;
  }

  .input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    max-width: calc(100% - 58px);
    border: 1px solid transparent;
    background: var(--message-in);
    border-radius: 24px;
    padding: 2px 4px;
    min-height: 46px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-color) 55%, transparent);
  }

  button,
  input {
    border: 0;
    font: inherit;
    outline: none;
  }

  input {
    flex: 1;
    min-width: 0;
    min-height: 40px;
    padding: 0 4px;
    color: var(--ink);
    background: transparent;
    font-size: 1.05rem;
  }

  input::placeholder {
    color: var(--muted);
  }

  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    clip-path: inset(50%);
  }

  button {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease, transform 0.15s ease;
  }

  .ghost {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    color: var(--muted);
    background: transparent;
    font-size: 1.4rem;
    flex-shrink: 0;
  }

  .ghost:active {
    background: rgba(0, 0, 0, 0.05);
  }

  .send {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    color: white;
    font-size: 1.4rem;
    background: var(--wa-green-dark);
    flex-shrink: 0;
  }

  .send:active {
    transform: scale(0.95);
  }

  .send.recording {
    background: #b3261e;
    animation: pulse 1s ease-in-out infinite;
  }

  .attach-sheet {
    position: absolute;
    left: 10px;
    right: 64px;
    bottom: 62px;
    z-index: 8;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    padding: 10px;
    border-radius: 20px;
    background: var(--paper);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
  }

  .attach-sheet button {
    min-height: 42px;
    border-radius: 14px;
    color: var(--ink);
    font-weight: 850;
    background: var(--nav-active);
  }

  @keyframes pulse {
    50% { transform: scale(0.94); }
  }
</style>
