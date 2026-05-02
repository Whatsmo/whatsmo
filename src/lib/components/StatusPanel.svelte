<script lang="ts">
  import type { AuthPayload, ContactProfile, StatusPostPayload, StatusPrivacy, ChatMessage } from '$lib/api/types';
  import Icon from './Icon.svelte';
  import StatusViewer from './StatusViewer.svelte';
  import {
    revokeStatus,
    sendImageStatus,
    sendRawStatus,
    sendStatusReaction,
    sendTextStatus,
    sendVideoStatus
  } from '$lib/api/whatsmo';
  import { syncContactsByPhoneNumbers } from '$lib/stores/app';
  import { createImageThumbnailBytes, createVideoThumbnailBytes, fileToBytes } from '$lib/utils/media';

  export let auth: AuthPayload;
  export let contacts: ContactProfile[] = [];
  export let statuses: Record<string, ChatMessage[]> = {};

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
  let isComposing = false;
  let activeViewerSenderId: string | null = null;

  $: userContacts = contacts.filter((contact) => contact.id.includes('@s.whatsapp.net'));
  $: canUseStatusRecipients = mode !== 'react';
  $: canSubmit = auth.mode === 'connected' && !busy && mode !== 'react' && hasRequiredInput();

  $: recentUpdates = Object.entries(statuses)
    .filter(([senderId, items]) => items.length > 0 && senderId !== 'me')
    .map(([senderId, items]) => {
      const contact = contacts.find(c => c.id === senderId || c.lid === senderId);
      return {
        senderId,
        contact,
        items,
        lastTimestamp: Math.max(...items.map(i => i.timestamp))
      };
    })
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);

  $: myStatuses = statuses['me'] ?? [];

  $: activeViewerStatuses = activeViewerSenderId ? statuses[activeViewerSenderId] ?? [] : [];
  $: activeViewerContactName = activeViewerSenderId
    ? (activeViewerSenderId === 'me' ? 'My status' : contacts.find(c => c.id === activeViewerSenderId || c.lid === activeViewerSenderId)?.name ?? 'Unknown contact')
    : '';
  $: activeViewerGradient = activeViewerSenderId
    ? contacts.find(c => c.id === activeViewerSenderId || c.lid === activeViewerSenderId)?.avatarGradient ?? 'linear-gradient(135deg, #25d366, #128c7e)'
    : '';

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
    if (mode === 'video') return videoFile !== null;
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
        lastPost = await sendImageStatus(
          await fileToBytes(imageFile),
          await createImageThumbnailBytes(imageFile),
          caption.trim(),
          recipients,
          privacy
        );
        imageFile = null;
        caption = '';
      } else if (mode === 'video' && videoFile) {
        lastPost = await sendVideoStatus(
          await fileToBytes(videoFile),
          thumbnailFile ? await fileToBytes(thumbnailFile) : await createVideoThumbnailBytes(videoFile),
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
  <div class="status-header">
    <h2>Status</h2>
    <div class="status-actions">
      <button class="icon-btn"><Icon name="more" /></button>
    </div>
  </div>

  <div class="status-row">
    <button class="status-item my-status" type="button" on:click={() => myStatuses.length > 0 ? (activeViewerSenderId = 'me') : (isComposing = true)}>
      <div class="avatar-wrapper">
        <div class="avatar my-avatar">
          <Icon name="person" />
        </div>
        {#if myStatuses.length > 0}
          <svg class="status-ring" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="none" stroke="var(--muted, #667781)" stroke-width="4" stroke-linecap="round" />
          </svg>
        {:else}
          <div class="add-badge">
            <Icon name="add" size="14px" />
          </div>
        {/if}
      </div>
      <span class="status-name">My status</span>
    </button>
  </div>

  <hr class="divider" />
  
  <div class="recent-updates">
    <h3>Recent updates</h3>
    {#if recentUpdates.length === 0}
      <p class="muted-text">No recent updates right now.</p>
    {:else}
      <div class="updates-list">
        {#each recentUpdates as update (update.senderId)}
          <button class="update-item" on:click={() => activeViewerSenderId = update.senderId}>
            <div class="avatar-wrapper">
              <div class="avatar contact-avatar" style={`background: ${update.contact?.avatarGradient ?? 'var(--muted)'}`}>
                {#if update.contact?.avatarUrl}
                  <img src={update.contact.avatarUrl} alt="" loading="lazy" referrerpolicy="no-referrer" />
                {:else}
                  {(update.contact?.name ?? 'U').slice(0, 1)}
                {/if}
              </div>
              <svg class="status-ring" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="48" fill="none" stroke="var(--wa-green, #008069)" stroke-width="4" stroke-dasharray={update.items.length > 1 ? "80 20" : "300"} stroke-linecap="round" />
              </svg>
            </div>
            <div class="update-info">
              <span class="status-name">{update.contact?.name ?? update.senderId}</span>
              <span class="status-time">
                {new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(update.lastTimestamp))}
              </span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="fab-container">
    <button class="fab small" on:click={() => { mode = 'text'; isComposing = true; }} aria-label="Text status">
      <Icon name="edit" />
    </button>
    <button class="fab" on:click={() => { mode = 'image'; isComposing = true; }} aria-label="Media status">
      <Icon name="camera" />
    </button>
  </div>
</section>

{#if isComposing}
  <div class="compose-modal">
    <header class="compose-header">
      <button class="icon-btn" on:click={() => (isComposing = false)}>
        <Icon name="arrow-back" />
      </button>
      <h2>{mode === 'text' ? 'Type a status' : mode === 'image' || mode === 'video' ? 'Send media' : 'Status Tool'}</h2>
      <div style="width: 40px"></div>
    </header>

    <div class="compose-body">
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
      <small>{thumbnailFile?.name ?? 'Generated automatically if you do not choose one.'}</small>
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
    </div>
  </div>
{/if}

{#if activeViewerSenderId}
  <StatusViewer 
    statuses={activeViewerStatuses} 
    contactName={activeViewerContactName}
    avatarGradient={activeViewerGradient}
    on:close={() => (activeViewerSenderId = null)} 
  />
{/if}

<style>
  .status-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    overflow-y: auto;
    padding: 16px;
    background: var(--paper, #fbfbf6);
    position: relative;
  }

  .status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .status-header h2 {
    color: var(--ink, #101f1b);
    font-size: 1.3rem;
    font-weight: 700;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--muted, #667781);
    cursor: pointer;
  }

  .status-row {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    padding-bottom: 8px;
    margin-left: -4px;
    padding-left: 4px;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 68px;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: center;
    background: transparent;
    cursor: pointer;
  }

  .avatar-wrapper {
    position: relative;
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 1.3rem;
    font-weight: 600;
    z-index: 1;
    overflow: hidden;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .my-avatar {
    background: #cfd9df;
    color: #667781;
  }

  .contact-avatar {
    border: 2px solid var(--paper, #fbfbf6);
  }

  .add-badge {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 22px;
    height: 22px;
    background: var(--wa-green, #008069);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    border: 2px solid var(--paper, #fbfbf6);
    z-index: 2;
  }

  .status-ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .status-name {
    font-size: 0.8rem;
    color: var(--ink, #101f1b);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .divider {
    border: none;
    border-top: 1px solid var(--border-color, #edf0eb);
    margin: 8px 0;
  }

  .recent-updates {
    padding: 8px 0;
  }

  .recent-updates h3 {
    font-size: 0.95rem;
    color: var(--muted, #667781);
    margin: 0 0 12px 0;
  }

  .updates-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .update-item {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  .update-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .update-info .status-name {
    font-size: 1rem;
    font-weight: 500;
    text-align: left;
  }

  .status-time {
    font-size: 0.85rem;
    color: var(--muted, #667781);
  }

  .muted-text {
    color: var(--muted, #667781);
    font-size: 0.9rem;
  }

  .fab-container {
    position: absolute;
    bottom: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    z-index: 10;
  }

  .fab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 16px; /* Material 3 square-rounded */
    border: none;
    color: white;
    background: var(--wa-green, #008069);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .fab.small {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: var(--nav-active, #e7f6ef);
    color: var(--ink, #101f1b);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .fab:active {
    transform: scale(0.95);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  /* Modal overlay styles */
  .compose-modal {
    position: absolute;
    inset: 0;
    z-index: 100;
    background: var(--paper, #fbfbf6);
    display: flex;
    flex-direction: column;
    animation: slideInRight 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .compose-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(14px + var(--safe-top, 0px)) 14px 14px;
    background: var(--wa-green, #008069);
    color: white;
  }

  .compose-header h2 {
    color: white;
    font-size: 1.15rem;
    font-weight: 700;
  }

  .compose-header .icon-btn {
    color: white;
    padding: 8px;
    border-radius: 50%;
  }

  .compose-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--paper, #fbfbf6);
  }

  .recipient-card {
    display: grid;
    gap: 8px;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--ink, #101f1b);
    font-size: 1.22rem;
  }

  small,
  .success,
  .unsupported,
  .error {
    color: var(--muted, #667781);
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
    border: 1px solid var(--border-color, #e2e7e3);
    border-radius: 20px;
    padding: 8px 16px;
    color: var(--ink, #54645f);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    background: transparent;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .mode-tabs button.active,
  .font-row button.active,
  .contacts button.active {
    color: white;
    background: var(--wa-green-dark, #075e54);
    border-color: var(--wa-green-dark, #075e54);
  }

  .recipient-card {
    padding: 16px;
    border-radius: 16px;
    border: 1px solid var(--border-color, #edf0eb);
    background: transparent;
    margin-bottom: 8px;
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
    border: 1px solid var(--border-color, #e2e7e3);
    border-radius: 12px;
    color: var(--ink, #101f1b);
    font: inherit;
    outline: none;
    background: transparent;
    padding: 12px;
    transition: border-color 0.2s ease;
  }

  textarea:focus,
  input:focus,
  select:focus {
    border-color: var(--wa-green, #008069);
  }

  textarea {
    min-height: 92px;
    resize: vertical;
  }

  input,
  select {
    min-height: 46px;
  }

  .swatches button {
    width: 40px;
    height: 40px;
    border: 2px solid transparent;
    border-radius: 50%;
    flex: 0 0 auto;
    cursor: pointer;
    transition: transform 0.1s ease;
  }

  .swatches button:hover {
    transform: scale(1.05);
  }

  .swatches button.active {
    border-color: var(--wa-green, #008069);
    box-shadow: 0 0 0 3px var(--paper, white) inset;
  }

  .post-button {
    min-height: 52px;
    border: 0;
    border-radius: 26px;
    color: white;
    font: inherit;
    font-size: 1.05rem;
    font-weight: 600;
    background: var(--wa-green, #008069);
    cursor: pointer;
    transition: background 0.2s ease, opacity 0.2s ease;
    margin-top: 16px;
  }

  .post-button:hover:not(:disabled) {
    opacity: 0.9;
  }

  button:disabled,
  .post-button:disabled {
    color: var(--muted, #667781);
    background: var(--border-color, #e7ece8);
    cursor: not-allowed;
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
