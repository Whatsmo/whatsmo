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
    gap: 14px;
    min-height: 0;
    overflow-y: auto;
    padding: 18px;
    border-radius: 34px;
    color: #061f1a;
    background: rgba(247, 255, 246, 0.7);
    backdrop-filter: blur(24px);
  }

  .hero {
    display: grid;
    place-items: center;
    height: 150px;
    border-radius: 28px;
    color: white;
    font-size: 4rem;
    font-weight: 1000;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
  }

  h2,
  h3,
  p,
  ul {
    margin: 0;
  }

  h2 {
    font-family: var(--display-font);
    font-size: 2rem;
    line-height: 1;
    letter-spacing: -0.05em;
  }

  p,
  li,
  span {
    color: rgba(6, 31, 26, 0.62);
    line-height: 1.45;
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .stats div,
  section {
    padding: 14px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.62);
  }

  strong {
    display: block;
    font-size: 1.3rem;
    font-weight: 1000;
  }

  .action-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  button {
    min-height: 44px;
    border: 0;
    border-radius: 16px;
    color: #075e54;
    font: inherit;
    font-weight: 1000;
    background: rgba(18, 140, 126, 0.1);
  }

  h3 {
    margin-bottom: 10px;
    font-size: 0.9rem;
  }

  ul {
    display: grid;
    gap: 8px;
    padding-left: 18px;
  }
</style>
