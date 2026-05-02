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
  ContactNumberChangedPayload,
  ContactProfilePayload,
  ContactSyncRequestedPayload,
  ContactUpdatedPayload,
  DownloadedMediaPayload,
  GroupMetadataPayload,
  HistorySyncPayload,
  HistorySyncProgressPayload,
  IncomingMessagePayload,
  MediaAttachment,
  MediaKind,
  ReceiptPayload,
  SessionStatusPayload,
  TypingPayload
} from '$lib/api/types';
import {
  enableNotifications,
  downloadMediaAttachment,
  getAccountDevice,
  getSessionStatus,
  isTauriRuntime,
  notifyNewMessage,
  resumeSavedSession,
  sendMediaMessage,
  sendTextMessage,
  syncContacts as syncContactsApi,
  syncContactProfiles as syncContactProfilesApi,
  syncGroupMetadata as syncGroupMetadataApi
} from '$lib/api/whatsmo';
import { createMediaPreviewDataUrl, fileToBytes } from '$lib/utils/media';

const now = Date.now();
const STORAGE_KEY = 'whatsmo.chat-state.v1';
const MAX_PERSISTED_MESSAGES_PER_CHAT = 120;
const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;
const MAX_CACHED_MEDIA_BYTES = 2 * 1024 * 1024;
const queuedRetryKeys = new Set<string>();
let queuedRetryTimer: number | undefined;
let groupMetadataTimer: number | undefined;
let contactProfileTimer: number | undefined;
const typingTimers = new Map<string, number>();

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
    archived: false,
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
    archived: false,
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
    archived: false,
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
  statuses: Record<string, ChatMessage[]>;
  contacts: ContactProfile[];
  groups: Record<string, GroupMetadataPayload>;
  selectedChatId: string;
  theme?: import('$lib/api/types').ThemeMode;
}

export const appState = writable<AppModel>(createInitialState());

if (typeof window !== 'undefined') {
  appState.subscribe((state) => {
    const persisted: PersistedAppData = {
      chats: state.chats,
      messages: trimPersistedMessages(state.messages),
      statuses: trimPersistedStatuses(state.statuses),
      contacts: state.contacts,
      groups: state.groups,
      selectedChatId: state.selectedChatId,
      theme: state.theme
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

export function toggleChatPinned(chatId: string): void {
  appState.update((state) => ({
    ...state,
    chats: sortChats(
      state.chats.map((chat) => (chat.id === chatId ? { ...chat, pinned: !chat.pinned, archived: false } : chat))
    )
  }));
}

export function toggleChatMuted(chatId: string): void {
  appState.update((state) => ({
    ...state,
    chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, muted: !chat.muted } : chat))
  }));
}

export function toggleChatArchived(chatId: string): void {
  appState.update((state) => {
    const selectedChat = state.chats.find((chat) => chat.id === chatId);
    const nextArchived = !selectedChat?.archived;
    return {
      ...state,
      selectedChatId: state.selectedChatId === chatId && nextArchived ? '' : state.selectedChatId,
      chats: sortChats(
        state.chats.map((chat) =>
          chat.id === chatId ? { ...chat, archived: nextArchived, pinned: nextArchived ? false : chat.pinned } : chat
        )
      )
    };
  });
}

export function toggleChatRead(chatId: string): void {
  appState.update((state) => ({
    ...state,
    chats: state.chats.map((chat) =>
      chat.id === chatId ? { ...chat, unreadCount: chat.unreadCount > 0 ? 0 : 1 } : chat
    )
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

  if (payload.connected) {
    scheduleQueuedMessageRetry();
    scheduleGroupMetadataSync();
    scheduleContactProfileSync();
  }
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

  if (payload.connected) {
    scheduleQueuedMessageRetry();
    scheduleGroupMetadataSync();
    scheduleContactProfileSync();
  }
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
    await syncKnownGroupMetadata();
    await syncKnownContactProfiles();
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

export async function syncKnownGroupMetadata(groupIds?: string[]): Promise<void> {
  const state = get(appState);
  const ids = groupIds ?? state.chats.filter((chat) => chat.kind === 'group').map((chat) => chat.id);
  const uniqueGroupIds = Array.from(new Set(ids.filter((id) => id.includes('@g.us'))));
  if (uniqueGroupIds.length === 0) return;

  try {
    const groups = await syncGroupMetadataApi(uniqueGroupIds);
    applyGroupMetadata(groups);
  } catch (error) {
    console.warn('Could not sync group metadata', error);
  }
}

export async function syncKnownContactProfiles(contactIds?: string[]): Promise<void> {
  const state = get(appState);
  const ids = contactIds ?? collectKnownContactJids(state);
  const uniqueContactIds = Array.from(
    new Set(ids.filter((id) => id.includes('@s.whatsapp.net') || id.includes('@lid')))
  );
  if (uniqueContactIds.length === 0) return;

  try {
    const profiles = await syncContactProfilesApi(uniqueContactIds);
    applyContactProfiles(profiles);
  } catch (error) {
    console.warn('Could not sync contact profiles', error);
  }
}

export function handleContactUpdated(payload: ContactUpdatedPayload): void {
  if (payload.pushName && !isRawIdentifierName(payload.pushName)) {
    applySenderPushName(payload.jid, payload.pushName, payload.timestampMs);
  }

  void syncKnownContactProfiles([payload.jid]);
}

function applySenderPushName(senderId: string, pushName: string, timestampMs: number): void {
  appState.update((state) => {
    const existing = state.contacts.find((contact) => contact.id === senderId || contact.lid === senderId);
    const profile: ContactProfile = {
      ...(existing ?? contactFromJid(senderId)),
      id: existing?.id ?? senderId,
      name: pushName,
      profileUpdatedAt: timestampMs
    };
    const contacts = upsertContacts(state.contacts, [profile]);
    return {
      ...state,
      contacts,
      messages: updateMessageSenderNames(state.messages, contacts),
      chats: sortChats(
        state.chats.map((chat) =>
          chat.id === senderId || chat.id === existing?.id ? { ...chat, title: pushName } : chat
        )
      )
    };
  });
}

export function handleContactSyncRequested(_payload: ContactSyncRequestedPayload): void {
  void syncKnownContactProfiles();
}

export function handleContactNumberChanged(payload: ContactNumberChangedPayload): void {
  const oldIds = [payload.oldJid, payload.oldLid].filter(Boolean) as string[];
  const newId = payload.newJid;

  appState.update((state) => {
    const replacement = migrateContactId(state.contacts, oldIds, newId, payload.newLid);
    return {
      ...state,
      contacts: replacement.contacts,
      selectedChatId: oldIds.includes(state.selectedChatId) ? newId : state.selectedChatId,
      chats: sortChats(
        state.chats.map((chat) =>
          oldIds.includes(chat.id)
            ? {
                ...chat,
                id: newId,
                title: displayNameFromJid(newId),
                avatarGradient: gradientFromId(newId)
              }
            : chat
        )
      ),
      messages: migrateMessagesByContactId(state.messages, oldIds, newId)
    };
  });

  void syncKnownContactProfiles([newId, payload.newLid].filter(Boolean) as string[]);
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
    senderName: 'You',
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

export interface SendAttachmentOptions {
  caption?: string;
  viewOnce?: boolean;
  ptt?: boolean;
  forcedKind?: MediaKind;
}

export async function sendAttachment(chatId: string, file: File, options: SendAttachmentOptions | string = ''): Promise<void> {
  const attachmentOptions: SendAttachmentOptions = typeof options === 'string' ? { caption: options } : options;
  if (file.size === 0) {
    throw new Error('Attachment file is empty.');
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Attachment is too large. Maximum supported size is 64 MB.');
  }

  const kind = attachmentOptions.forcedKind ?? mediaKindFromFile(file);
  if (!kind) {
    throw new Error('Unsupported attachment type. Use an image, video, or document file.');
  }

  const trimmedCaption = (attachmentOptions.caption ?? '').trim();
  const name = file.name || `${kind}-attachment`;
  const bytes = await fileToBytes(file);
  const mimeType = file.type || fallbackMimeType(kind);
  const previewUrl = kind !== 'document' ? await createMediaPreviewDataUrl(file) : undefined;
  const cachedDataUrl = kind !== 'document' && file.size <= MAX_CACHED_MEDIA_BYTES
    ? bytesToDataUrl(bytes, mimeType)
    : undefined;
  const optimistic: ChatMessage = {
    id: crypto.randomUUID(),
    chatId,
    senderId: 'me',
    senderName: 'You',
    text: trimmedCaption || undefined,
    timestamp: Date.now(),
    fromMe: true,
    status: 'queued',
    media: {
      id: crypto.randomUUID(),
      kind,
      name,
      mimeType,
      previewUrl,
      cachedDataUrl,
      cachedAt: cachedDataUrl ? Date.now() : undefined,
      viewOnce: attachmentOptions.viewOnce,
      ptt: attachmentOptions.ptt
    }
  };

  appendMessage(optimistic);

  try {
    const sent = await sendMediaMessage(
      chatId,
      kind,
      bytes,
      mimeType,
      name,
      trimmedCaption || undefined,
      undefined,
      attachmentOptions.viewOnce,
      attachmentOptions.ptt
    );
    markMessageStatus(chatId, optimistic.id, 'sent', sent.id);
  } catch (error) {
    markMessageStatus(chatId, optimistic.id, 'failed');
    console.error('Failed to send attachment', error);
    throw error;
  }
}

export async function retryMessage(chatId: string, messageId: string): Promise<void> {
  const message = get(appState).messages[chatId]?.find((item) => item.id === messageId);
  if (!message?.text || !message.fromMe || message.deleted) {
    return;
  }

  const retryKey = queueKey(chatId, messageId);
  if (queuedRetryKeys.has(retryKey)) {
    return;
  }

  queuedRetryKeys.add(retryKey);
  markMessageStatus(chatId, messageId, 'queued');

  try {
    const sent = await sendTextMessage(chatId, message.text);
    markMessageStatus(chatId, messageId, 'sent', sent.id);
  } catch (error) {
    markMessageStatus(chatId, messageId, 'failed');
    console.error('Failed to retry queued message', error);
  } finally {
    queuedRetryKeys.delete(retryKey);
  }
}

export async function retryQueuedMessages(chatId?: string): Promise<void> {
  const state = get(appState);
  const candidates = Object.entries(state.messages)
    .filter(([candidateChatId]) => !chatId || candidateChatId === chatId)
    .flatMap(([candidateChatId, chatMessages]) =>
      chatMessages
        .filter(isRetryableOutgoingMessage)
        .map((message) => ({ chatId: candidateChatId, messageId: message.id }))
    );

  for (const candidate of candidates) {
    await retryMessage(candidate.chatId, candidate.messageId);
  }
}

export async function downloadAttachment(chatId: string, messageId: string): Promise<void> {
  const message = get(appState).messages[chatId]?.find((item) => item.id === messageId);
  if (!message?.media) return;

  if (message.media.cachedDataUrl) {
    return;
  }

  const downloaded = await downloadMediaAttachment(message.media);
  if (downloaded.size > MAX_CACHED_MEDIA_BYTES) {
    throw new Error('Attachment downloaded, but it is too large to cache in the WebView preview store.');
  }

  cacheDownloadedMedia(chatId, messageId, downloaded);
}

function cacheDownloadedMedia(chatId: string, messageId: string, downloaded: DownloadedMediaPayload): void {
  const dataUrl = bytesToDataUrl(downloaded.data, downloaded.mimeType);
  appState.update((state) => ({
    ...state,
    messages: {
      ...state.messages,
      [chatId]: (state.messages[chatId] ?? []).map((message) =>
        message.id === messageId && message.media
          ? {
              ...message,
              media: {
                ...message.media,
                name: downloaded.name || message.media.name,
                kind: downloaded.kind,
                mimeType: downloaded.mimeType,
                cachedDataUrl: dataUrl,
                cachedAt: Date.now()
              }
            }
          : message
      )
    }
  }));
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

  const currentState = get(appState);
  const message: ChatMessage = {
    id: payload.id,
    chatId: payload.chatId,
    senderId: payload.senderId,
    senderName: resolveMessageSenderName(currentState, payload.senderId, payload.senderName),
    text: payload.text,
    timestamp: payload.timestampMs,
    fromMe: payload.fromMe,
    status: payload.fromMe ? 'sent' : 'delivered',
    media: normalizeMediaAttachment(payload.media)
  };

  if (payload.chatId === 'status@broadcast') {
    appendStatus(message);
    if (payload.senderName && !isRawIdentifierName(payload.senderName)) {
      applySenderPushName(payload.senderId, payload.senderName, payload.timestampMs);
    }
    scheduleContactProfileSync([payload.senderId]);
    return;
  }

  appendMessage(message);
  if (payload.senderName && !isRawIdentifierName(payload.senderName)) {
    applySenderPushName(payload.senderId, payload.senderName, payload.timestampMs);
  }
  scheduleContactProfileSync([payload.senderId, payload.isGroup ? '' : payload.chatId]);

  const state = get(appState);
  const chat = state.chats.find((item) => item.id === payload.chatId);
  if (state.notificationEnabled && chat && !payload.fromMe) {
    notifyNewMessage(chat.title, payload.text ?? 'New WhatsApp message', payload.chatId);
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

  if (payload.chatId === 'status@broadcast') {
    appState.update((state) => {
      const statuses = { ...state.statuses };
      for (const msg of historyMessages) {
        const existing = statuses[msg.senderId] ?? [];
        if (!existing.some((item) => item.id === msg.id)) {
          statuses[msg.senderId] = [...existing, msg];
        }
      }
      return {
        ...state,
        statuses: trimPersistedStatuses(statuses)
      };
    });
    scheduleContactProfileSync(collectContactJidsFromHistory(payload));
    return;
  }

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
      archived: existingChat?.archived ?? false,
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

  if (payload.isGroup) {
    scheduleGroupMetadataSync([payload.chatId]);
  }
  scheduleContactProfileSync(collectContactJidsFromHistory(payload));
}

export function applyContactProfiles(profiles: ContactProfilePayload[]): void {
  if (profiles.length === 0) return;

  const incomingProfiles = profiles.map(profileFromPayload);
  appState.update((state) => {
    const contacts = upsertContacts(state.contacts, incomingProfiles);
    const profileMap = new Map(incomingProfiles.map((profile) => [profile.id, profile]));
    const messages = updateMessageSenderNames(state.messages, contacts);

    return {
      ...state,
      contacts,
      messages,
      chats: sortChats(
        state.chats.map((chat) => {
          const profile = profileMap.get(chat.id);
          if (!profile) return chat;

          return {
            ...chat,
            title: profile.name || chat.title,
            avatarUrl: profile.avatarUrl ?? chat.avatarUrl,
            subtitle: chat.subtitle || profile.about
          };
        })
      )
    };
  });
}

export function applyGroupMetadata(groups: GroupMetadataPayload[]): void {
  if (groups.length === 0) return;

  appState.update((state) => {
    const groupMap = {
      ...state.groups,
      ...Object.fromEntries(groups.map((group) => [group.id, group]))
    };

    return {
      ...state,
      groups: groupMap,
      chats: sortChats(
        state.chats.map((chat) => {
          const group = groupMap[chat.id];
          if (!group) return chat;

          return {
            ...chat,
            title: group.subject || chat.title,
            avatarUrl: group.avatarUrl ?? chat.avatarUrl,
            subtitle: group.isAnnouncement ? 'Announcement group' : chat.subtitle,
            participantCount: group.participantCount,
            groupDescription: group.description,
            groupAdminCount: group.adminCount,
            groupIsLocked: group.isLocked,
            groupIsAnnouncement: group.isAnnouncement
          };
        })
      )
    };
  });
}

export function setHistoryProgress(payload: HistorySyncProgressPayload): void {
  appState.update((state) => ({ ...state, historySync: payload }));
}

export function setTyping(payload: TypingPayload): void {
  const timerKey = `${payload.chatId}:${payload.name}`;
  if (typeof window !== 'undefined') {
    window.clearTimeout(typingTimers.get(timerKey));
    typingTimers.delete(timerKey);
  }

  appState.update((state) => ({
    ...state,
    chats: state.chats.map((chat) =>
      chat.id === payload.chatId
        ? { ...chat, typing: payload.isTyping ? `${resolveTypingName(state, payload)} is typing...` : undefined }
        : chat
    )
  }));

  if (payload.isTyping && typeof window !== 'undefined') {
    typingTimers.set(
      timerKey,
      window.setTimeout(() => {
        clearTyping(payload.chatId, timerKey);
      }, 6500)
    );
  }
}

function clearTyping(chatId: string, timerKey: string): void {
  typingTimers.delete(timerKey);
  appState.update((state) => ({
    ...state,
    chats: state.chats.map((chat) => (chat.id === chatId ? { ...chat, typing: undefined } : chat))
  }));
}

function resolveTypingName(state: AppModel, payload: TypingPayload): string {
  const contact = state.contacts.find((item) => item.id === payload.name || item.lid === payload.name);
  if (contact) return contact.name;

  const senderUser = shortJid(payload.name);
  const phoneContact = state.contacts.find((item) => shortJid(item.id) === senderUser || shortJid(item.phone) === senderUser);
  if (phoneContact) return phoneContact.name;

  if (/^\d+$/.test(senderUser)) return `+${senderUser}`;

  return displayNameFromJid(payload.name);
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
      archived: false,
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

function appendStatus(message: ChatMessage): void {
  appState.update((state) => {
    const existingStatuses = state.statuses[message.senderId] ?? [];
    if (existingStatuses.some((item) => item.id === message.id)) {
      return state;
    }

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const activeStatuses = [...existingStatuses, message].filter((item) => item.timestamp > cutoff);

    return {
      ...state,
      statuses: {
        ...state.statuses,
        [message.senderId]: activeStatuses
      }
    };
  });
}

function messageFromIncomingPayload(payload: IncomingMessagePayload): ChatMessage {
  const state = get(appState);
  return {
    id: payload.id,
    chatId: payload.chatId,
    senderId: payload.senderId,
    senderName: resolveMessageSenderName(state, payload.senderId, payload.senderName),
    text: payload.text,
    timestamp: payload.timestampMs,
    fromMe: payload.fromMe,
    status: payload.fromMe ? 'sent' : 'delivered',
    media: normalizeMediaAttachment(payload.media)
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

function scheduleQueuedMessageRetry(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.clearTimeout(queuedRetryTimer);
  queuedRetryTimer = window.setTimeout(() => {
    void retryQueuedMessages();
  }, 800);
}

function scheduleGroupMetadataSync(groupIds?: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.clearTimeout(groupMetadataTimer);
  groupMetadataTimer = window.setTimeout(() => {
    void syncKnownGroupMetadata(groupIds);
  }, 1000);
}

function scheduleContactProfileSync(contactIds?: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.clearTimeout(contactProfileTimer);
  contactProfileTimer = window.setTimeout(() => {
    void syncKnownContactProfiles(contactIds);
  }, 1200);
}

function isRetryableOutgoingMessage(message: ChatMessage): boolean {
  return (
    message.fromMe &&
    !message.deleted &&
    typeof message.text === 'string' &&
    message.text.trim().length > 0 &&
    (message.status === 'failed' || message.status === 'queued')
  );
}

function queueKey(chatId: string, messageId: string): string {
  return `${chatId}:${messageId}`;
}

function mediaKindFromFile(file: File): MediaKind | null {
  if (file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')) return 'sticker';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

function fallbackMimeType(kind: MediaKind): string {
  if (kind === 'image') return 'image/jpeg';
  if (kind === 'video') return 'video/mp4';
  if (kind === 'audio') return 'audio/ogg; codecs=opus';
  if (kind === 'sticker') return 'image/webp';
  return 'application/octet-stream';
}

function normalizeMediaAttachment(media?: MediaAttachment): MediaAttachment | undefined {
  if (!media) return undefined;
  if (media.previewUrl || media.cachedDataUrl || !media.thumbnail || typeof window === 'undefined') {
    return media;
  }

  return {
    ...media,
    previewUrl: bytesToDataUrl(media.thumbnail, media.kind === 'sticker' ? 'image/png' : 'image/jpeg')
  };
}

function bytesToDataUrl(bytes: number[], mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${mimeType};base64,${window.btoa(binary)}`;
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
      statuses: persisted.statuses,
      contacts: persisted.contacts,
      groups: persisted.groups,
      selectedChatId: persisted.selectedChatId,
      notificationEnabled: false,
      theme: persisted.theme ?? 'system'
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
    statuses: {},
    contacts: shouldSeedPreview ? contacts : [],
    groups: {},
    selectedChatId: shouldSeedPreview ? chats[0]?.id ?? '' : '',
    notificationEnabled: false,
    theme: 'system'
  };
}

export function setTheme(theme: import('$lib/api/types').ThemeMode): void {
  appState.update((state) => ({ ...state, theme }));
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
    const statusesValue = parsed.statuses;
    const contactsValue = parsed.contacts;
    const groupsValue = parsed.groups;
    const selectedChatIdValue = parsed.selectedChatId;
    const themeValue = parsed.theme;

    if (
      !Array.isArray(chatsValue) ||
      !isRecord(messagesValue) ||
      !Array.isArray(contactsValue) ||
      (groupsValue !== undefined && !isRecord(groupsValue)) ||
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

    const statusesBySender: Record<string, ChatMessage[]> = {};
    if (isRecord(statusesValue)) {
      for (const [senderId, senderStatuses] of Object.entries(statusesValue)) {
        if (Array.isArray(senderStatuses)) {
          statusesBySender[senderId] = senderStatuses as ChatMessage[];
        }
      }
    }

    return {
      chats: chatsValue as ChatSummary[],
      messages: messagesByChat,
      statuses: statusesBySender,
      contacts: contactsValue as ContactProfile[],
      groups: (groupsValue as Record<string, GroupMetadataPayload> | undefined) ?? {},
      selectedChatId: selectedChatIdValue,
      theme: (themeValue as import('$lib/api/types').ThemeMode) ?? 'system'
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

function trimPersistedStatuses(source: Record<string, ChatMessage[]>): Record<string, ChatMessage[]> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return Object.fromEntries(
    Object.entries(source)
      .map(([senderId, statuses]) => [
        senderId,
        statuses.filter((status) => status.timestamp > cutoff)
      ])
      .filter(([_, statuses]) => statuses.length > 0)
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

function profileFromPayload(contact: ContactProfilePayload): ContactProfile {
  return {
    id: contact.id,
    name: contact.phone ? `+${contact.phone}` : displayNameFromJid(contact.id),
    phone: `+${contact.phone}`,
    about: contact.about ?? (contact.isBusiness ? 'Business account' : 'WhatsApp contact'),
    avatarGradient: gradientFromId(contact.id),
    avatarUrl: contact.avatarUrl,
    lid: contact.lid,
    pictureId: contact.pictureId,
    profileUpdatedAt: contact.updatedAtMs,
    isBusiness: contact.isBusiness
  };
}

function updateMessageSenderNames(
  messages: Record<string, ChatMessage[]>,
  contacts: ContactProfile[]
): Record<string, ChatMessage[]> {
  return Object.fromEntries(
    Object.entries(messages).map(([chatId, chatMessages]) => [
      chatId,
      chatMessages.map((message) => ({
        ...message,
        senderName: message.fromMe ? message.senderName : resolveSenderNameFromContacts(contacts, message.senderId, message.senderName)
      }))
    ])
  );
}

function resolveMessageSenderName(state: AppModel, senderId: string, providedName?: string): string {
  if (providedName && !isRawIdentifierName(providedName)) {
    return providedName;
  }

  return resolveSenderNameFromContacts(state.contacts, senderId, providedName);
}

function resolveSenderNameFromContacts(
  contacts: ContactProfile[],
  senderId: string,
  currentName?: string
): string {
  const contact = contacts.find(
    (item) => item.id === senderId || item.lid === senderId || shortJid(item.id) === shortJid(senderId)
  );
  if (contact) return contact.name || contact.phone;

  if (currentName && !isRawIdentifierName(currentName)) return currentName;

  if (senderId.includes('@s.whatsapp.net')) {
    const user = shortJid(senderId);
    return /^\d+$/.test(user) ? `+${user}` : user;
  }

  return 'Unknown contact';
}

function isRawIdentifierName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes('@') || /^\d{8,}$/.test(trimmed);
}

function collectKnownContactJids(state: AppModel): string[] {
  return [
    ...state.contacts.map((contact) => contact.id),
    ...state.chats.filter((chat) => chat.kind === 'direct').map((chat) => chat.id),
    ...Object.values(state.messages).flatMap((chatMessages) => chatMessages.map((message) => message.senderId))
  ];
}

function collectContactJidsFromHistory(payload: HistorySyncPayload): string[] {
  return [
    ...(payload.isGroup ? [] : [payload.chatId]),
    ...payload.messages.map((message) => message.senderId)
  ];
}

function upsertContacts(existing: ContactProfile[], incoming: ContactProfile[]): ContactProfile[] {
  const byId = new Map(existing.map((contact) => [contact.id, contact]));
  for (const contact of incoming) {
    byId.set(contact.id, { ...byId.get(contact.id), ...contact });
  }

  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function migrateContactId(
  existing: ContactProfile[],
  oldIds: string[],
  newId: string,
  newLid?: string
): { contacts: ContactProfile[] } {
  const oldContact = existing.find((contact) => oldIds.includes(contact.id));
  const filtered = existing.filter((contact) => !oldIds.includes(contact.id) && contact.id !== newId);
  const migrated: ContactProfile = {
    ...(oldContact ?? contactFromJid(newId)),
    id: newId,
    name: displayNameFromJid(newId),
    phone: newId.includes('@s.whatsapp.net') ? `+${shortJid(newId)}` : newId,
    lid: newLid ?? oldContact?.lid,
    avatarGradient: gradientFromId(newId)
  };

  return { contacts: upsertContacts(filtered, [migrated]) };
}

function migrateMessagesByContactId(
  messages: Record<string, ChatMessage[]>,
  oldIds: string[],
  newId: string
): Record<string, ChatMessage[]> {
  const migrated: Record<string, ChatMessage[]> = {};
  for (const [chatId, chatMessages] of Object.entries(messages)) {
    const nextChatId = oldIds.includes(chatId) ? newId : chatId;
    migrated[nextChatId] = [
      ...(migrated[nextChatId] ?? []),
      ...chatMessages.map((message) => ({
        ...message,
        chatId: oldIds.includes(message.chatId) ? newId : message.chatId,
        senderId: oldIds.includes(message.senderId) ? newId : message.senderId
      }))
    ];
  }

  return migrated;
}

function displayNameFromJid(jid: string): string {
  if (jid.includes('@g.us')) {
    return `Group ${shortJid(jid)}`;
  }

  if (jid.includes('@lid')) {
    return 'Unknown contact';
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
