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
  let showAdvanced = false;

  function cycleColor(): void {
    const currentIndex = colors.findIndex((c) => c.value === selectedColor.value);
    selectedColor = colors[(currentIndex + 1) % colors.length];
  }

  function cycleFont(): void {
    const currentIndex = fonts.findIndex((f) => f.value === selectedFont.value);
    selectedFont = fonts[(currentIndex + 1) % fonts.length];
  }

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
      <Icon name="edit" size="24px" />
    </button>
    <button class="fab" on:click={() => { mode = 'image'; isComposing = true; }} aria-label="Media status">
      <Icon name="camera" size="24px" />
    </button>
  </div>
</section>

{#if isComposing}
  <div class="compose-modal" class:text-mode={mode === 'text'} style={mode === 'text' ? `background: ${selectedColor.css}` : ''}>
    {#if mode === 'text'}
      <header class="compose-header transparent">
        <button class="icon-btn" on:click={() => (isComposing = false)}>
          <Icon name="close" size="24px" />
        </button>
        <div class="header-actions">
          <button class="icon-btn" on:click={cycleFont}>
            <Icon name="text_fields" size="24px" />
          </button>
          <button class="icon-btn" on:click={cycleColor}>
            <Icon name="palette" size="24px" />
          </button>
        </div>
      </header>

      <div class="compose-body text-center">
        <textarea
          bind:value={text}
          class={`status-textarea font-${selectedFont.value}`}
          placeholder="Type a status"
          maxlength="700"
        ></textarea>
      </div>

      <div class="compose-footer">
        <button type="button" class="privacy-indicator" on:click={() => (showAdvanced = !showAdvanced)}>
          <Icon name="group" size="16px" />
          <span>{selectedRecipients.length} recipients</span>
        </button>
        <button class="send-fab" disabled={!canSubmit} on:click={submit}>
          {#if busy}
            <span class="spinner-white"></span>
          {:else}
            <Icon name="send" size="24px" />
          {/if}
        </button>
      </div>
    {:else if mode === 'image' || mode === 'video'}
      <header class="compose-header transparent dark-overlay">
        <button class="icon-btn" on:click={() => (isComposing = false)}>
          <Icon name="close" size="24px" />
        </button>
        <h2>{mode === 'image' ? 'Image status' : 'Video status'}</h2>
        <div style="width: 40px"></div>
      </header>

      <div class="compose-body media-mode">
        {#if (mode === 'image' && imageFile) || (mode === 'video' && videoFile)}
          <div class="media-preview">
            {#if mode === 'image' && imageFile}
              <img src={URL.createObjectURL(imageFile)} alt="Status preview" />
            {:else if mode === 'video' && videoFile}
              <video src={URL.createObjectURL(videoFile)} controls muted><track kind="captions" /></video>
            {/if}
          </div>
        {:else}
          <div class="media-picker">
            <Icon name={mode === 'image' ? 'image' : 'videocam'} size="64px" />
            <p>Select {mode === 'image' ? 'an image' : 'a video'}</p>
            <input 
              accept={mode === 'image' ? 'image/*' : 'video/*'} 
              type="file" 
              on:change={mode === 'image' ? handleImageChange : handleVideoChange} 
            />
          </div>
        {/if}
      </div>

      <div class="compose-footer sticky-footer">
        <div class="caption-wrapper">
          <input bind:value={caption} placeholder="Add a caption..." />
        </div>
        <div class="footer-bottom">
          <button type="button" class="privacy-indicator" on:click={() => (showAdvanced = !showAdvanced)}>
            <Icon name="group" size="16px" />
            <span>{selectedRecipients.length} recipients</span>
          </button>
          <button class="send-fab" disabled={!canSubmit} on:click={submit}>
            {#if busy}
              <span class="spinner-white"></span>
            {:else}
              <Icon name="send" size="24px" />
            {/if}
          </button>
        </div>
      </div>
    {:else}
      <!-- Advanced/Legacy mode UI -->
      <header class="compose-header">
        <button class="icon-btn" on:click={() => (isComposing = false)}>
          <Icon name="arrow_back" size="24px" />
        </button>
        <h2>Status Tools</h2>
        <div style="width: 40px"></div>
      </header>
      <div class="compose-body">
         <div class="mode-tabs">
            {#each modes as item}
              <button class:active={mode === item.value} on:click={() => (mode = item.value)}>{item.label}</button>
            {/each}
          </div>
          <div class="advanced-form">
            {#if mode === 'raw'}
              <label class="field">
                <span>Raw text payload</span>
                <textarea bind:value={rawText} placeholder="Builds a raw wa::Message extendedTextMessage"></textarea>
              </label>
            {:else if mode === 'revoke'}
              <label class="field">
                <span>Status message ID</span>
                <input bind:value={revokeMessageId} placeholder="Message ID returned when posting" />
              </label>
            {:else if mode === 'react'}
              <p class="unsupported">Status reactions pending crate update.</p>
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
            <button class="btn btn-primary" disabled={!canSubmit} on:click={submit}>
              {busy ? 'Processing...' : 'Run Tool'}
            </button>
          </div>
      </div>
    {/if}

    {#if showAdvanced}
      <div 
        class="advanced-overlay" 
        on:click={() => (showAdvanced = false)} 
        on:keydown={(e) => e.key === 'Escape' && (showAdvanced = false)}
        role="button"
        tabindex="-1"
      >
        <div class="advanced-panel" on:click|stopPropagation role="dialog" aria-modal="true">
          <header class="panel-header">
            <h3>Status privacy</h3>
            <button class="icon-btn" on:click={() => (showAdvanced = false)}>
              <Icon name="close" size="20px" />
            </button>
          </header>
          
          <div class="panel-body">
            <div class="recipient-card">
              <label class="field compact">
                <span>Sync recipients</span>
                <div class="sync-input">
                  <input bind:value={contactInput} inputmode="tel" placeholder="62812..." />
                  <button class="secondary" disabled={busy} on:click={addContacts}>Sync</button>
                </div>
              </label>

              <div class="contacts-grid">
                {#each userContacts as contact (contact.id)}
                  <button class="contact-pill" class:active={selectedRecipients.includes(contact.id)} on:click={() => toggleRecipient(contact.id)}>
                    {contact.name}
                  </button>
                {/each}
              </div>
            </div>

            <label class="field compact">
              <span>Privacy mode</span>
              <select bind:value={privacy}>
                <option value="contacts">Contacts</option>
                <option value="allowlist">Allow list</option>
                <option value="denylist">Deny list</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    {/if}

    {#if errorMessage}
      <div class="error-toast">{errorMessage}</div>
    {/if}
    
    {#if lastPost}
      <div class="success-toast">Status posted!</div>
    {/if}
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
  :global(.spinner-white) {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    display: block;
    animation: spin 1s linear infinite;
  }

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

  /* Immersive Compose Modal */
  .compose-modal {
    position: absolute;
    inset: 0;
    z-index: 100;
    background: var(--paper, #fbfbf6);
    display: flex;
    flex-direction: column;
    animation: slideInUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .compose-modal.text-mode {
    transition: background-color 0.4s ease;
  }

  @keyframes slideInUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .compose-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(12px + var(--safe-top, 0px)) 16px 12px;
    z-index: 10;
  }

  .compose-header.transparent {
    background: transparent;
  }

  .compose-header.dark-overlay {
    background: linear-gradient(to bottom, rgba(0,0,0,0.4), transparent);
    color: white;
  }

  .compose-header h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .icon-btn {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    border-radius: 50%;
    color: inherit;
    cursor: pointer;
  }

  .compose-header.transparent .icon-btn {
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
  }

  .compose-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    position: relative;
  }

  .compose-body.text-center {
    justify-content: center;
    align-items: center;
    padding: 40px 24px;
  }

  .status-textarea {
    width: 100%;
    max-width: 400px;
    background: transparent;
    border: none;
    color: white;
    font-size: 2.2rem;
    font-weight: 700;
    text-align: center;
    resize: none;
    outline: none;
    line-height: 1.2;
  }

  .status-textarea::placeholder {
    color: rgba(255,255,255,0.6);
  }

  .compose-footer {
    padding: 16px 20px max(20px, calc(16px + var(--safe-bottom)));
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 10;
  }

  .compose-footer.sticky-footer {
    flex-direction: column;
    gap: 16px;
    background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
  }

  .caption-wrapper {
    width: 100%;
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(10px);
    border-radius: 24px;
    padding: 4px 16px;
    border: 1px solid rgba(255,255,255,0.2);
  }

  .caption-wrapper input {
    width: 100%;
    height: 44px;
    background: transparent;
    border: none;
    color: white;
    font: inherit;
    outline: none;
  }

  .footer-bottom {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .privacy-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(0,0,0,0.25);
    color: white;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
  }

  .send-fab {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--wa-green, #25d366);
    color: white;
    border: none;
    display: grid;
    place-items: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    cursor: pointer;
  }

  .send-fab:disabled {
    opacity: 0.5;
    background: #8696a0;
  }

  /* Media Preview */
  .media-mode {
    background: #000;
  }

  .media-preview {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .media-preview img, 
  .media-preview video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .media-picker {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    color: white;
  }

  .media-picker input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  /* Advanced / Legacy Form */
  .advanced-form {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .mode-tabs {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border-color);
  }

  .mode-tabs button {
    padding: 6px 14px;
    border-radius: 16px;
    border: 1px solid var(--border-color);
    background: var(--nav-active);
    white-space: nowrap;
    font-weight: 600;
  }

  .mode-tabs button.active {
    background: var(--wa-green);
    color: white;
    border-color: var(--wa-green);
  }

  /* Advanced Overlay */
  .advanced-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: flex-end;
  }

  .advanced-panel {
    width: 100%;
    background: var(--paper);
    border-radius: 24px 24px 0 0;
    padding: 20px 20px max(24px, calc(16px + var(--safe-bottom)));
    animation: slideInUp 0.3s ease-out;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .contacts-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .contact-pill {
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid var(--border-color);
    background: transparent;
    font-size: 0.85rem;
  }

  .contact-pill.active {
    background: var(--wa-green-light);
    color: var(--wa-green-dark);
    border-color: var(--wa-green);
  }

  .sync-input {
    display: flex;
    gap: 8px;
  }

  .sync-input input {
    flex: 1;
    height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--border-color);
  }

  /* Toasts */
  .error-toast, .success-toast {
    position: fixed;
    top: calc(16px + var(--safe-top));
    left: 16px;
    right: 16px;
    padding: 12px 16px;
    border-radius: 12px;
    color: white;
    z-index: 300;
    animation: fadeDown 0.3s ease;
  }

  .error-toast { background: #dc3545; }
  .success-toast { background: var(--wa-green-dark); }

  @keyframes fadeDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Typography */
  .font-0 { font-family: inherit; }
  .font-1 { font-family: Georgia, serif; }
  .font-2 { font-family: 'Cascadia Mono', monospace; }
  .font-3 { font-family: 'Brush Script MT', cursive; font-size: 2.8rem !important; }
  .font-4 { font-weight: 900; text-transform: uppercase; letter-spacing: -0.05em; }


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





  button:disabled {
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
