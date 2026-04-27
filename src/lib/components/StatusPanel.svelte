<script lang="ts">
  import type { AuthPayload, ContactProfile, StatusPostPayload, StatusPrivacy } from '$lib/api/types';
  import {
    revokeStatus,
    sendImageStatus,
    sendRawStatus,
    sendStatusReaction,
    sendTextStatus,
    sendVideoStatus
  } from '$lib/api/whatsmo';
  import { syncContactsByPhoneNumbers } from '$lib/stores/app';

  export let auth: AuthPayload;
  export let contacts: ContactProfile[] = [];

  type Mode = 'text' | 'image' | 'video' | 'raw' | 'revoke' | 'react';

  const modes: Array<{ label: string; value: Mode }> = [
    { label: 'Text', value: 'text' },
    { label: 'Image', value: 'image' },
    { label: 'Video', value: 'video' },
    { label: 'Raw', value: 'raw' },
    { label: 'Revoke', value: 'revoke' },
    { label: 'React', value: 'react' }
  ];

  const colors = [
    { name: 'WhatsApp green', value: 0xff1e6e4f, css: '#1e6e4f' },
    { name: 'Night blue', value: 0xff1a3045, css: '#1a3045' },
    { name: 'Clay', value: 0xff8d4f3a, css: '#8d4f3a' },
    { name: 'Graphite', value: 0xff202c33, css: '#202c33' }
  ];

  const fonts = [
    { label: 'Default', value: 0 },
    { label: 'Serif', value: 1 },
    { label: 'Mono', value: 2 },
    { label: 'Script', value: 3 },
    { label: 'Condensed', value: 4 }
  ];

  let mode: Mode = 'text';
  let privacy: StatusPrivacy = 'contacts';
  let contactInput = '';
  let selectedRecipients: string[] = [];
  let text = '';
  let rawText = '';
  let caption = '';
  let imageFile: File | null = null;
  let videoFile: File | null = null;
  let thumbnailFile: File | null = null;
  let durationSeconds = 15;
  let revokeMessageId = '';
  let reactionOwner = '';
  let reactionServerId = '';
  let reaction = '💚';
  let selectedColor = colors[0];
  let selectedFont = fonts[0];
  let busy = false;
  let lastPost: StatusPostPayload | null = null;
  let errorMessage = '';

  $: userContacts = contacts.filter((contact) => contact.id.includes('@s.whatsapp.net'));
  $: canUseStatusRecipients = mode !== 'react';
  $: canSubmit = auth.mode === 'connected' && !busy && mode !== 'react' && hasRequiredInput();

  function hasRequiredInput(): boolean {
    if (mode === 'react') {
      return reactionOwner.trim().length > 0 && Number.isFinite(Number(reactionServerId));
    }

    if (selectedRecipients.length === 0) {
      return false;
    }

    if (mode === 'text') return text.trim().length > 0;
    if (mode === 'raw') return rawText.trim().length > 0;
    if (mode === 'image') return imageFile !== null;
    if (mode === 'video') return videoFile !== null && thumbnailFile !== null;
    if (mode === 'revoke') return revokeMessageId.trim().length > 0;
    return false;
  }

  function contactIdToPhone(id: string): string {
    return id.split('@')[0] ?? id;
  }

  function toggleRecipient(id: string): void {
    selectedRecipients = selectedRecipients.includes(id)
      ? selectedRecipients.filter((item) => item !== id)
      : [...selectedRecipients, id];
  }

  async function addContacts(): Promise<void> {
    const phones = contactInput
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (phones.length === 0) return;

    busy = true;
    errorMessage = '';
    try {
      const synced = await syncContactsByPhoneNumbers(phones);
      const ids = synced.map((contact) => contact.id);
      selectedRecipients = Array.from(new Set([...selectedRecipients, ...ids]));
      contactInput = '';
      if (synced.length === 0) {
        errorMessage = 'No registered WhatsApp contacts found for those numbers.';
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  function handleImageChange(event: Event): void {
    imageFile = getSelectedFile(event);
  }

  function handleVideoChange(event: Event): void {
    videoFile = getSelectedFile(event);
  }

  function handleThumbnailChange(event: Event): void {
    thumbnailFile = getSelectedFile(event);
  }

  function getSelectedFile(event: Event): File | null {
    const input = event.currentTarget;
    return input instanceof HTMLInputElement ? input.files?.[0] ?? null : null;
  }

  async function fileToBytes(file: File): Promise<number[]> {
    const buffer = await file.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  }

  async function submit(): Promise<void> {
    if (!canSubmit) return;

    busy = true;
    errorMessage = '';
    lastPost = null;

    const recipients = selectedRecipients.map(contactIdToPhone);

    try {
      if (mode === 'text') {
        lastPost = await sendTextStatus(text.trim(), selectedColor.value, selectedFont.value, recipients, privacy);
        text = '';
      } else if (mode === 'raw') {
        lastPost = await sendRawStatus(rawText.trim(), recipients, privacy);
        rawText = '';
      } else if (mode === 'image' && imageFile) {
        lastPost = await sendImageStatus(await fileToBytes(imageFile), null, caption.trim(), recipients, privacy);
        imageFile = null;
        caption = '';
      } else if (mode === 'video' && videoFile && thumbnailFile) {
        lastPost = await sendVideoStatus(
          await fileToBytes(videoFile),
          await fileToBytes(thumbnailFile),
          Math.max(1, Math.round(durationSeconds)),
          caption.trim(),
          recipients,
          privacy
        );
        videoFile = null;
        thumbnailFile = null;
        caption = '';
      } else if (mode === 'revoke') {
        lastPost = await revokeStatus(revokeMessageId.trim(), recipients, privacy);
        revokeMessageId = '';
      } else if (mode === 'react') {
        lastPost = await sendStatusReaction(reactionOwner.trim(), Number(reactionServerId), reaction.trim());
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<section class="status-panel" aria-label="Status updates">
  <div class="status-panel__intro">
    <span>Updates</span>
    <h2>Status tools</h2>
    <p>Post text, image, video, raw statuses, revoke your own statuses, or react to someone else's status.</p>
  </div>

  <div class="mode-tabs" aria-label="Status mode">
    {#each modes as item}
      <button class:active={mode === item.value} on:click={() => (mode = item.value)}>{item.label}</button>
    {/each}
  </div>

  {#if canUseStatusRecipients}
    <div class="recipient-card">
      <label class="field compact">
        <span>Sync recipients</span>
        <input bind:value={contactInput} inputmode="tel" placeholder="62812..., 62857..." />
      </label>
      <button class="secondary" disabled={busy || auth.mode !== 'connected'} on:click={addContacts}>Sync</button>

      <div class="contacts" aria-label="Synced contacts">
        {#if userContacts.length === 0}
          <small>No synced user contacts yet. Add phone numbers above.</small>
        {/if}
        {#each userContacts as contact (contact.id)}
          <button class:active={selectedRecipients.includes(contact.id)} on:click={() => toggleRecipient(contact.id)}>
            <strong>{contact.name}</strong>
            <span>{contact.phone}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if mode === 'text'}
    <div class="preview" style={`background: ${selectedColor.css}`}>
      <p class={`font-${selectedFont.value}`}>{text || 'Type a status...'}</p>
    </div>

    <label class="field">
      <span>Status text</span>
      <textarea bind:value={text} maxlength="700" placeholder="What do you want to share?"></textarea>
    </label>

    <div class="swatches" aria-label="Background colors">
      {#each colors as color}
        <button
          class:active={selectedColor.value === color.value}
          style={`background: ${color.css}`}
          aria-label={color.name}
          on:click={() => (selectedColor = color)}
        ></button>
      {/each}
    </div>

    <div class="font-row" aria-label="Font style">
      {#each fonts as font}
        <button class:active={selectedFont.value === font.value} on:click={() => (selectedFont = font)}>
          {font.label}
        </button>
      {/each}
    </div>
  {:else if mode === 'image'}
    <label class="field">
      <span>Image</span>
      <input accept="image/*" type="file" on:change={handleImageChange} />
      <small>{imageFile?.name ?? 'Choose an image to upload as status.'}</small>
    </label>
    <label class="field">
      <span>Caption</span>
      <input bind:value={caption} placeholder="Optional caption" />
    </label>
  {:else if mode === 'video'}
    <label class="field">
      <span>Video</span>
      <input accept="video/*" type="file" on:change={handleVideoChange} />
      <small>{videoFile?.name ?? 'Choose a video file.'}</small>
    </label>
    <label class="field">
      <span>JPEG thumbnail</span>
      <input accept="image/jpeg,image/jpg" type="file" on:change={handleThumbnailChange} />
      <small>{thumbnailFile?.name ?? 'Required by whatsapp-rust for video status.'}</small>
    </label>
    <label class="field">
      <span>Duration seconds</span>
      <input bind:value={durationSeconds} min="1" type="number" />
    </label>
    <label class="field">
      <span>Caption</span>
      <input bind:value={caption} placeholder="Optional caption" />
    </label>
  {:else if mode === 'raw'}
    <label class="field">
      <span>Raw text payload</span>
      <textarea bind:value={rawText} placeholder="Builds a raw wa::Message extendedTextMessage"></textarea>
    </label>
  {:else if mode === 'revoke'}
    <label class="field">
      <span>Status message ID</span>
      <input bind:value={revokeMessageId} placeholder="Message ID returned when posting" />
    </label>
  {:else}
    <p class="unsupported">
      Status reactions are in the upstream docs, but the installed whatsapp-rust 0.5.0 crate does not expose
      `client.status().send_reaction` yet. This tab is kept here so we can enable it as soon as the crate catches up.
    </p>
    <label class="field">
      <span>Status owner</span>
      <input bind:value={reactionOwner} inputmode="tel" placeholder="62812..." />
    </label>
    <label class="field">
      <span>Server ID</span>
      <input bind:value={reactionServerId} inputmode="numeric" placeholder="Numeric server id" />
    </label>
    <label class="field">
      <span>Reaction</span>
      <input bind:value={reaction} placeholder="💚 or blank to remove" />
    </label>
  {/if}

  {#if canUseStatusRecipients}
    <label class="field compact">
      <span>Privacy mode</span>
      <select bind:value={privacy}>
        <option value="contacts">Contacts</option>
        <option value="allowlist">Allow list</option>
        <option value="denylist">Deny list</option>
      </select>
    </label>
  {/if}

  <button class="post-button" disabled={!canSubmit} on:click={submit}>
    {busy
      ? 'Working...'
      : auth.mode !== 'connected'
        ? 'Connect WhatsApp first'
        : mode === 'react'
          ? 'Reaction unavailable'
          : `${modes.find((item) => item.value === mode)?.label} status`}
  </button>

  {#if lastPost}
    <p class="success">Done. ID: {lastPost.id}</p>
  {/if}

  {#if errorMessage}
    <p class="error">{errorMessage}</p>
  {/if}
</section>

<style>
  .status-panel {
    display: grid;
    align-content: start;
    gap: 14px;
    min-height: 0;
    overflow-y: auto;
    padding: 0 14px 16px;
    background: var(--paper, #fbfbf6);
  }

  .status-panel__intro,
  .recipient-card {
    display: grid;
    gap: 8px;
  }

  .status-panel__intro span {
    color: var(--wa-green, #008069);
    font-size: 0.75rem;
    font-weight: 900;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--ink, #101f1b);
    font-size: 1.22rem;
  }

  .status-panel__intro p,
  small,
  .success,
  .unsupported,
  .error {
    color: #667781;
    font-size: 0.82rem;
    line-height: 1.42;
  }

  .mode-tabs,
  .swatches,
  .font-row,
  .contacts {
    display: flex;
    gap: 8px;
    overflow-x: auto;
  }

  .mode-tabs button,
  .font-row button,
  .contacts button,
  .secondary {
    flex: 0 0 auto;
    border: 0;
    border-radius: 999px;
    padding: 9px 12px;
    color: #54645f;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 850;
    background: #f0f2f1;
  }

  .mode-tabs button.active,
  .font-row button.active,
  .contacts button.active {
    color: #0b211a;
    background: #d9fdd3;
  }

  .recipient-card {
    padding: 12px;
    border-radius: 20px;
    background: white;
  }

  .contacts button {
    display: grid;
    gap: 2px;
    text-align: left;
  }

  .contacts span {
    color: #667781;
    font-size: 0.72rem;
  }

  .preview {
    display: grid;
    place-items: center;
    min-height: 210px;
    border-radius: 24px;
    padding: 22px;
    color: white;
    text-align: center;
    box-shadow: 0 16px 36px rgba(16, 31, 27, 0.16);
  }

  .preview p {
    overflow-wrap: anywhere;
    font-size: 1.65rem;
    font-weight: 850;
    line-height: 1.18;
  }

  .font-1 { font-family: Georgia, serif; }
  .font-2 { font-family: ui-monospace, 'Cascadia Mono', monospace; font-size: 1.35rem !important; }
  .font-3 { font-style: italic; }
  .font-4 { letter-spacing: -0.07em; text-transform: uppercase; }

  .field {
    display: grid;
    gap: 7px;
  }

  .field span {
    color: var(--ink, #101f1b);
    font-size: 0.82rem;
    font-weight: 900;
  }

  textarea,
  input,
  select {
    width: 100%;
    border: 1px solid #e2e7e3;
    border-radius: 18px;
    color: var(--ink, #101f1b);
    font: inherit;
    outline: none;
    background: white;
  }

  textarea {
    min-height: 92px;
    resize: vertical;
    padding: 13px;
  }

  input,
  select {
    min-height: 46px;
    padding: 0 13px;
  }

  .swatches button {
    width: 38px;
    height: 38px;
    border: 3px solid transparent;
    border-radius: 999px;
    flex: 0 0 auto;
  }

  .swatches button.active {
    border-color: #25d366;
    box-shadow: 0 0 0 2px white inset;
  }

  .post-button {
    min-height: 48px;
    border: 0;
    border-radius: 999px;
    color: white;
    font: inherit;
    font-weight: 950;
    background: var(--wa-green, #008069);
  }

  button:disabled,
  .post-button:disabled {
    color: #667781;
    background: #e7ece8;
  }

  .success {
    color: var(--wa-green, #008069);
    font-weight: 850;
  }

  .unsupported {
    padding: 12px;
    border-radius: 18px;
    color: #5f4b00;
    background: #fff4c2;
  }

  .error {
    color: #b3261e;
    font-weight: 850;
  }
</style>
