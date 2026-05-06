<script lang="ts">
  import type { ChatSummary, ContactProfile } from '$lib/api/types';

  export let chat: ChatSummary;
  export let contacts: ContactProfile[] = [];

  $: profile = contacts.find((contact) => contact.id === chat.id);
</script>

<aside class="profile-panel" aria-label="Profile and actions">
  <div class="hero" style={`background: ${chat.avatarGradient}`}>
    <span>{chat.title.slice(0, 1)}</span>
  </div>
  <h2>{chat.title}</h2>
  <p>{profile?.about ?? (chat.kind === 'group' ? 'Group conversation' : 'WhatsApp contact')}</p>

  <div class="stats">
    <div>
      <strong>{chat.kind === 'group' ? chat.participantCount ?? 0 : profile?.isOnline ? 'Now' : 'Seen'}</strong>
      <span>{chat.kind === 'group' ? 'members' : 'presence'}</span>
    </div>
    <div>
      <strong>{chat.muted ? 'Muted' : 'On'}</strong>
      <span>notifications</span>
    </div>
  </div>

  <div class="action-grid">
    <button>Media</button>
    <button>Search</button>
    <button>Mute</button>
    <button>Archive</button>
  </div>

  <section>
    <h3>MVP coverage</h3>
    <ul>
      <li>QR + phone pair-code authentication</li>
      <li>Chat list and realtime message bridge</li>
      <li>Groups, media previews, receipts, typing states</li>
      <li>Mobile notification permission flow</li>
    </ul>
  </section>
</aside>

<style>
  .profile-panel {
    display: grid;
    align-content: start;
    gap: 0;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 0;
    border-radius: 0;
    color: var(--ink);
    background: var(--app-bg);
  }

  .hero {
    display: grid;
    place-items: center;
    height: 120px;
    border-radius: 0;
    color: white;
    font-size: 3rem;
    font-weight: 500;
  }

  h2,
  h3,
  p,
  ul {
    margin: 0;
  }

  h2 {
    font-size: 1.25rem;
    font-weight: 500;
    line-height: 1.2;
  }

  p,
  li,
  span {
    color: var(--muted);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border-bottom: 8px solid var(--app-bg);
  }

  .stats div,
  section {
    padding: 12px 16px;
    border-radius: 0;
    background: var(--paper);
  }

  .stats div + div {
    border-left: 1px solid var(--border-color);
  }

  strong {
    display: block;
    font-size: 1.125rem;
    font-weight: 500;
    color: var(--ink);
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
    padding: 8px 0;
    background: var(--paper);
    border-bottom: 8px solid var(--app-bg);
  }

  button {
    min-height: 48px;
    border: 0;
    border-radius: 0;
    color: var(--wa-green-dark);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  button:active {
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  h3 {
    margin-bottom: 6px;
    padding: 12px 16px 0;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--muted);
  }

  ul {
    display: grid;
    gap: 0;
    padding: 0;
    list-style: none;
    background: var(--paper);
  }

  ul li {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-color);
  }

  ul li:last-child {
    border-bottom: 0;
  }
</style>
