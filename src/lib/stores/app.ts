import { derived, get, writable } from 'svelte/store';
import type {
  AccountDevicePayload,
  AppModel,
  AuthPayload,
  ChatMessage,
  ChatSummary,
  ConnectionPayload,
  ContactProfile,
  ContactLookupPayload,
  HistorySyncPayload,
  HistorySyncProgressPayload,
  IncomingMessagePayload,
  ReceiptPayload,
  SessionStatusPayload,
  TypingPayload
} from '$lib/api/types';
import {
  enableNotifications,
  getAccountDevice,
  getSessionStatus,
  isTauriRuntime,
  notifyNewMessage,
  resumeSavedSession,
  sendTextMessage,
  syncContacts as syncContactsApi
} from '$lib/api/whatsmo';

const now = Date.now();
const STORAGE_KEY = 'whatsmo.chat-state.v1';
const MAX_PERSISTED_MESSAGES_PER_CHAT = 120;

const contacts: ContactProfile[] = [
  {
    id: '6281299012345@s.whatsapp.net',
    name: 'Nadia',
    phone: '+62 812-9901-2345',
    about: 'Available',
    avatarGradient: 'linear-gradient(135deg, #1dd1a1, #10ac84)',
    isOnline: true
  },
  {
    id: 'team-design@g.us',
    name: 'Whatsmo Test Group',
    phone: '8 participants',
    about: 'Android test devices and login flow.',
    avatarGradient: 'linear-gradient(135deg, #0abde3, #006266)'
  },
  {
    id: '6285711004321@s.whatsapp.net',
    name: 'Raka',
    phone: '+62 857-1100-4321',
    about: 'Business account',
    avatarGradient: 'linear-gradient(135deg, #feca57, #ff6b6b)',
    isBusiness: true
  }
];

const chats: ChatSummary[] = [
  {
    id: contacts[0].id,
    kind: 'direct',
    title: contacts[0].name,
    subtitle: 'Can you send the APK build later?',
    unreadCount: 2,
    muted: false,
    pinned: true,
    avatarGradient: contacts[0].avatarGradient,
    lastMessageAt: now - 1000 * 60 * 3,
    typing: 'typing...'
  },
  {
    id: contacts[1].id,
    kind: 'group',
    title: contacts[1].name,
    subtitle: 'Faris: Pair code worked on my test number.',
    unreadCount: 5,
    muted: false,
    pinned: false,
    avatarGradient: contacts[1].avatarGradient,
    lastMessageAt: now - 1000 * 60 * 24,
    participantCount: 8
  },
  {
    id: contacts[2].id,
    kind: 'direct',
    title: contacts[2].name,
    subtitle: 'Image received',
    unreadCount: 0,
    muted: true,
    pinned: false,
    avatarGradient: contacts[2].avatarGradient,
    lastMessageAt: now - 1000 * 60 * 80
  }
];

const messages: Record<string, ChatMessage[]> = {
  [contacts[0].id]: [
    {
      id: 'm1',
      chatId: contacts[0].id,
      senderId: contacts[0].id,
      text: 'I tried pairing on a spare number. QR login showed up fine.',
      timestamp: now - 1000 * 60 * 18,
      fromMe: false,
      status: 'read'
    },
    {
      id: 'm2',
      chatId: contacts[0].id,
      senderId: 'me',
      text: 'Nice. I’m keeping it close to WhatsApp Android first, then we can add the extra stuff later.',
      timestamp: now - 1000 * 60 * 11,
      fromMe: true,
      status: 'read'
    },
    {
      id: 'm3',
      chatId: contacts[0].id,
      senderId: contacts[0].id,
      text: 'Can you send the APK build later?',
      timestamp: now - 1000 * 60 * 3,
      fromMe: false,
      status: 'delivered'
    }
  ],
  [contacts[1].id]: [
    {
      id: 'g1',
      chatId: contacts[1].id,
      senderId: 'faris',
      text: 'Pair code worked on my test number.',
      timestamp: now - 1000 * 60 * 48,
      fromMe: false,
      status: 'read'
    },
    {
      id: 'g2',
      chatId: contacts[1].id,
      senderId: 'me',
      text: 'Good. Next I want to test incoming group messages from the Rust bridge.',
      timestamp: now - 1000 * 60 * 39,
      fromMe: true,
      status: 'delivered'
    }
  ],
  [contacts[2].id]: [
    {
      id: 'b1',
      chatId: contacts[2].id,
      senderId: contacts[2].id,
      text: 'Image received from the media event test.',
      timestamp: now - 1000 * 60 * 80,
      fromMe: false,
      status: 'read',
      media: {
        id: 'media-1',
        kind: 'image',
        name: 'campaign-preview.jpg'
      }
    }
  ]
};

interface PersistedAppData {
  chats: ChatSummary[];
  messages: Record<string, ChatMessage[]>;
  contacts: ContactProfile[];
  selectedChatId: string;
}

export const appState = writable<AppModel>(createInitialState());

if (typeof window !== 'undefined') {
  appState.subscribe((state) => {
    const persisted: PersistedAppData = {
      chats: state.chats,
      messages: trimPersistedMessages(state.messages),
      contacts: state.contacts,
      selectedChatId: state.selectedChatId
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch (error) {
      console.warn('Could not persist Whatsmo chat state', error);
    }
  });
}

export const selectedChat = derived(appState, ($appState): ChatSummary | null =>
  $appState.chats.find((chat) => chat.id === $appState.selectedChatId) ?? $appState.chats[0] ?? null
);

export const selectedMessages = derived(appState, ($appState) =>
  $appState.selectedChatId ? $appState.messages[$appState.selectedChatId] ?? [] : []
);

export function selectChat(chatId: string): void {
  appState.update((state) => ({
    ...state,
    selectedChatId: chatId,
    chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat))
  }));
}

export function setAuth(payload: AuthPayload): void {
  appState.update((state) => ({ ...state, auth: payload }));
}

export function setConnection(payload: ConnectionPayload): void {
  appState.update((state) => ({
    ...state,
    account: payload.connected ? state.account : null,
    auth: {
      mode: payload.connected ? 'connected' : 'logged-out',
      message: payload.message
    }
  }));
}

export function setSessionStatus(payload: SessionStatusPayload): void {
  appState.update((state) => {
    if (payload.connected) {
      return {
        ...state,
        auth: {
          mode: 'connected',
          message: payload.message
        }
      };
    }

    if (state.auth.mode === 'qr' || state.auth.mode === 'pair-code') {
      return state;
    }

    return {
      ...state,
      auth: {
        mode: payload.running ? 'connecting' : 'idle',
        message: payload.message
      }
    };
  });
}

export async function refreshSessionStatus(): Promise<void> {
  const status = await getSessionStatus();
  setSessionStatus(status);
}

export function setAccountDevice(payload: AccountDevicePayload | null): void {
  appState.update((state) => ({ ...state, account: payload }));
}

export async function refreshAccountDevice(): Promise<void> {
  try {
    const account = await getAccountDevice();
    setAccountDevice(account);
  } catch (error) {
    console.warn('Could not refresh account/device details', error);
  }
}

export async function resumeSession(): Promise<void> {
  appState.update((state) => ({
    ...state,
    auth: {
      mode: 'connecting',
      message: 'Restoring saved WhatsApp session...'
    }
  }));

  try {
    const status = await resumeSavedSession();
    setSessionStatus(status);
    await refreshAccountDevice();
  } catch (error) {
    appState.update((state) => ({
      ...state,
      auth: {
        mode: 'error',
        message:
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Could not restore saved WhatsApp session.'
      }
    }));
  }
}

export async function requestNotifications(): Promise<void> {
  const enabled = await enableNotifications();
  appState.update((state) => ({ ...state, notificationEnabled: enabled }));
}

export async function syncContactsByPhoneNumbers(rawPhones: string[]): Promise<ContactProfile[]> {
  const phones = rawPhones.map((phone) => phone.trim()).filter(Boolean);
  if (phones.length === 0) {
    return [];
  }

  const synced = await syncContactsApi(phones);
  const profiles = synced.filter((contact) => contact.isRegistered).map(profileFromLookup);

  if (profiles.length > 0) {
    appState.update((state) => ({
      ...state,
      contacts: upsertContacts(state.contacts, profiles)
    }));
  }

  return profiles;
}

export async function sendMessage(chatId: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const optimistic: ChatMessage = {
    id: crypto.randomUUID(),
    chatId,
    senderId: 'me',
    text: trimmed,
    timestamp: Date.now(),
    fromMe: true,
    status: 'queued'
  };

  appendMessage(optimistic);

  try {
    const sent = await sendTextMessage(chatId, trimmed);
    markMessageStatus(chatId, optimistic.id, 'sent', sent.id);
  } catch (error) {
    markMessageStatus(chatId, optimistic.id, 'failed');
    console.error('Failed to send message', error);
  }
}

export function ingestIncomingMessage(payload: IncomingMessagePayload): void {
  if (payload.eventKind === 'edit') {
    applyMessageEdit(payload);
    return;
  }

  if (payload.eventKind === 'revoke' || payload.eventKind === 'admin-revoke') {
    applyMessageRevoke(payload);
    return;
  }

  if (payload.eventKind === 'other') {
    return;
  }

  const message: ChatMessage = {
    id: payload.id,
    chatId: payload.chatId,
    senderId: payload.senderId,
    text: payload.text,
    timestamp: payload.timestampMs,
    fromMe: payload.fromMe,
    status: payload.fromMe ? 'sent' : 'delivered'
  };

  appendMessage(message);

  const state = get(appState);
  const chat = state.chats.find((item) => item.id === payload.chatId);
  if (state.notificationEnabled && chat && !payload.fromMe) {
    notifyNewMessage(chat.title, payload.text ?? 'New WhatsApp message');
  }
}

function applyMessageEdit(payload: IncomingMessagePayload): void {
  const targetMessageId = payload.targetMessageId;
  if (!targetMessageId) return;

  appState.update((state) => {
    const existingMessages = state.messages[payload.chatId] ?? [];
    let changed = false;
    const messages = existingMessages.map((message) => {
      if (message.id !== targetMessageId) return message;
      changed = true;
      return {
        ...message,
        text: payload.text ?? message.text,
        edited: true,
        timestamp: Math.max(message.timestamp, payload.timestampMs)
      };
    });

    if (!changed) return state;

    return updateChatAfterMessageMutation(state, payload.chatId, messages);
  });
}

function applyMessageRevoke(payload: IncomingMessagePayload): void {
  const targetMessageId = payload.targetMessageId ?? payload.id;
  appState.update((state) => {
    const existingMessages = state.messages[payload.chatId] ?? [];
    let changed = false;
    const messages = existingMessages.map((message) => {
      if (message.id !== targetMessageId) return message;
      changed = true;
      return {
        ...message,
        text: payload.eventKind === 'admin-revoke' ? 'This message was deleted by an admin.' : 'This message was deleted.',
        deleted: true,
        media: undefined
      };
    });

    if (!changed) return state;

    return updateChatAfterMessageMutation(state, payload.chatId, messages);
  });
}

export function ingestHistorySync(payload: HistorySyncPayload): void {
  const historyMessages = payload.messages.map(messageFromIncomingPayload);

  appState.update((state) => {
    const existingMessages = state.messages[payload.chatId] ?? [];
    const mergedMessages = mergeMessages(existingMessages, historyMessages);
    const existingChat = state.chats.find((chat) => chat.id === payload.chatId);
    const lastMessage = mergedMessages.at(-1);
    const syncedChat: ChatSummary = {
      id: payload.chatId,
      kind: payload.isGroup ? 'group' : 'direct',
      title: existingChat?.title ?? payload.title,
      subtitle: lastMessage?.text ?? existingChat?.subtitle ?? 'Synced from WhatsApp history',
      unreadCount: existingChat?.unreadCount ?? payload.unreadCount,
      muted: existingChat?.muted ?? false,
      pinned: existingChat?.pinned ?? false,
      avatarGradient: existingChat?.avatarGradient ?? gradientFromId(payload.chatId),
      lastMessageAt: lastMessage?.timestamp ?? payload.lastMessageAt,
      participantCount: existingChat?.participantCount
    };
    const chats = existingChat
      ? state.chats.map((chat) => (chat.id === payload.chatId ? syncedChat : chat))
      : [syncedChat, ...state.chats];

    return {
      ...state,
      selectedChatId: state.selectedChatId || payload.chatId,
      chats: sortChats(chats),
      messages: {
        ...state.messages,
        [payload.chatId]: mergedMessages
      }
    };
  });
}

export function setHistoryProgress(payload: HistorySyncProgressPayload): void {
  appState.update((state) => ({ ...state, historySync: payload }));
}

export function setTyping(payload: TypingPayload): void {
  appState.update((state) => ({
    ...state,
    chats: state.chats.map((chat) =>
      chat.id === payload.chatId
        ? { ...chat, typing: payload.isTyping ? `${payload.name} is typing...` : undefined }
        : chat
    )
  }));
}

export function setReceipt(payload: ReceiptPayload): void {
  markMessageStatus(payload.chatId, payload.messageId, payload.status);
}

function appendMessage(message: ChatMessage): void {
  appState.update((state) => {
    const existingMessages = state.messages[message.chatId] ?? [];
    if (existingMessages.some((item) => item.id === message.id)) {
      return state;
    }

    const existingChat = state.chats.find((chat) => chat.id === message.chatId);
    const fallbackTitle = message.chatId.includes('@g.us')
      ? `Group ${shortJid(message.chatId)}`
      : displayNameFromJid(message.chatId);
    const chat: ChatSummary = existingChat ?? {
      id: message.chatId,
      kind: message.chatId.includes('@g.us') ? 'group' : 'direct',
      title: fallbackTitle,
      subtitle: message.text ?? 'Media message',
      unreadCount: 0,
      muted: false,
      pinned: false,
      avatarGradient: 'linear-gradient(135deg, #25d366, #128c7e)',
      lastMessageAt: message.timestamp
    };

    const contactExists = state.contacts.some((contact) => contact.id === message.senderId);
    const contacts = message.fromMe || contactExists ? state.contacts : [...state.contacts, contactFromJid(message.senderId)];

    const updatedChat: ChatSummary = {
      ...chat,
      subtitle: message.text ?? message.media?.name ?? 'Media message',
      lastMessageAt: message.timestamp,
      unreadCount:
        message.fromMe || state.selectedChatId === message.chatId ? chat.unreadCount : chat.unreadCount + 1
    };

    const chats = existingChat
      ? state.chats.map((item) => (item.id === message.chatId ? updatedChat : item))
      : [updatedChat, ...state.chats];

    return {
      ...state,
      contacts,
      selectedChatId: state.selectedChatId || message.chatId,
      chats: sortChats(chats),
      messages: {
        ...state.messages,
        [message.chatId]: [...existingMessages, message].slice(-MAX_PERSISTED_MESSAGES_PER_CHAT)
      }
    };
  });
}

function messageFromIncomingPayload(payload: IncomingMessagePayload): ChatMessage {
  return {
    id: payload.id,
    chatId: payload.chatId,
    senderId: payload.senderId,
    text: payload.text,
    timestamp: payload.timestampMs,
    fromMe: payload.fromMe,
    status: payload.fromMe ? 'sent' : 'delivered'
  };
}

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, { ...byId.get(message.id), ...message });
  }

  return Array.from(byId.values())
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-MAX_PERSISTED_MESSAGES_PER_CHAT);
}

function updateChatAfterMessageMutation(
  state: AppModel,
  chatId: string,
  messages: ChatMessage[]
): AppModel {
  const lastMessage = messages.at(-1);
  return {
    ...state,
    chats: sortChats(
      state.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              subtitle: lastMessage?.text ?? chat.subtitle,
              lastMessageAt: lastMessage?.timestamp ?? chat.lastMessageAt
            }
          : chat
      )
    ),
    messages: {
      ...state.messages,
      [chatId]: messages
    }
  };
}

function sortChats(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort(
    (left, right) => Number(right.pinned) - Number(left.pinned) || right.lastMessageAt - left.lastMessageAt
  );
}

function markMessageStatus(chatId: string, localId: string, status: ChatMessage['status'], sentId?: string): void {
  appState.update((state) => ({
    ...state,
    messages: {
      ...state.messages,
      [chatId]: (state.messages[chatId] ?? []).map((message) =>
        message.id === localId ? { ...message, id: sentId ?? message.id, status } : message
      )
    }
  }));
}

function createInitialState(): AppModel {
  const persisted = loadPersistedState();
  if (persisted) {
    return {
      auth: {
        mode: 'idle',
        message: 'Restoring saved WhatsApp session...'
      },
      account: null,
      historySync: null,
      chats: persisted.chats,
      messages: persisted.messages,
      contacts: persisted.contacts,
      selectedChatId: persisted.selectedChatId,
      notificationEnabled: false
    };
  }

  const shouldSeedPreview = typeof window !== 'undefined' && !isTauriRuntime();

  return {
    auth: {
      mode: 'idle',
      message: 'Pair this companion client with QR code or phone number code.'
    },
    account: null,
    historySync: null,
    chats: shouldSeedPreview ? chats : [],
    messages: shouldSeedPreview ? messages : {},
    contacts: shouldSeedPreview ? contacts : [],
    selectedChatId: shouldSeedPreview ? chats[0]?.id ?? '' : '',
    notificationEnabled: false
  };
}

function loadPersistedState(): PersistedAppData | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    const chatsValue = parsed.chats;
    const messagesValue = parsed.messages;
    const contactsValue = parsed.contacts;
    const selectedChatIdValue = parsed.selectedChatId;

    if (
      !Array.isArray(chatsValue) ||
      !isRecord(messagesValue) ||
      !Array.isArray(contactsValue) ||
      typeof selectedChatIdValue !== 'string'
    ) {
      return null;
    }

    const messagesByChat: Record<string, ChatMessage[]> = {};
    for (const [chatId, chatMessages] of Object.entries(messagesValue)) {
      if (Array.isArray(chatMessages)) {
        messagesByChat[chatId] = chatMessages as ChatMessage[];
      }
    }

    return {
      chats: chatsValue as ChatSummary[],
      messages: messagesByChat,
      contacts: contactsValue as ContactProfile[],
      selectedChatId: selectedChatIdValue
    };
  } catch (error) {
    console.warn('Could not load Whatsmo chat state', error);
    return null;
  }
}

function trimPersistedMessages(source: Record<string, ChatMessage[]>): Record<string, ChatMessage[]> {
  return Object.fromEntries(
    Object.entries(source).map(([chatId, chatMessages]) => [
      chatId,
      chatMessages.slice(-MAX_PERSISTED_MESSAGES_PER_CHAT)
    ])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function contactFromJid(jid: string): ContactProfile {
  return {
    id: jid,
    name: displayNameFromJid(jid),
    phone: jid.includes('@s.whatsapp.net') ? `+${shortJid(jid)}` : jid,
    about: 'WhatsApp contact',
    avatarGradient: gradientFromId(jid)
  };
}

function profileFromLookup(contact: ContactLookupPayload): ContactProfile {
  return {
    id: contact.id,
    name: displayNameFromJid(contact.id),
    phone: `+${contact.phone}`,
    about: contact.about ?? (contact.isBusiness ? 'Business account' : 'WhatsApp contact'),
    avatarGradient: gradientFromId(contact.id),
    isBusiness: contact.isBusiness
  };
}

function upsertContacts(existing: ContactProfile[], incoming: ContactProfile[]): ContactProfile[] {
  const byId = new Map(existing.map((contact) => [contact.id, contact]));
  for (const contact of incoming) {
    byId.set(contact.id, { ...byId.get(contact.id), ...contact });
  }

  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function displayNameFromJid(jid: string): string {
  if (jid.includes('@g.us')) {
    return `Group ${shortJid(jid)}`;
  }

  const user = shortJid(jid);
  return /^\d+$/.test(user) ? `+${user}` : user;
}

function shortJid(jid: string): string {
  return jid.split('@')[0]?.split(':')[0]?.split('.')[0] ?? jid;
}

function gradientFromId(id: string): string {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }

  return `linear-gradient(135deg, hsl(${hash} 72% 42%), hsl(${(hash + 36) % 360} 72% 32%))`;
}
