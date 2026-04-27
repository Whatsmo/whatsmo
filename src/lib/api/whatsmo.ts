import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification';
import type {
  AuthPayload,
  AccountDevicePayload,
  ConnectionPayload,
  ContactLookupPayload,
  ContactProfilePayload,
  GroupMetadataPayload,
  HistorySyncPayload,
  HistorySyncProgressPayload,
  IncomingMessagePayload,
  OutgoingMessagePayload,
  ReceiptPayload,
  SessionStatusPayload,
  StatusPrivacy,
  StatusPostPayload,
  TypingPayload
} from './types';

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as TauriWindow);
}

export async function startQrAuth(): Promise<AuthPayload> {
  if (!isTauriRuntime()) {
    return {
      mode: 'qr',
      qrCode: 'whatsmo-dev-preview-qr',
      message: 'Browser preview is using a demo QR. Run inside Tauri to pair WhatsApp.'
    };
  }

  return invoke<AuthPayload>('start_qr_auth');
}

export async function requestPairCode(phoneNumber: string): Promise<AuthPayload> {
  if (!isTauriRuntime()) {
    return {
      mode: 'pair-code',
      pairCode: 'MOCK-248',
      phoneNumber,
      message: 'Browser preview pair code. Run inside Tauri to request a real WhatsApp code.'
    };
  }

  return invoke<AuthPayload>('request_pair_code', { phoneNumber });
}

export async function disconnectSession(): Promise<ConnectionPayload> {
  if (!isTauriRuntime()) {
    return { connected: false, message: 'Preview session cleared.' };
  }

  return invoke<ConnectionPayload>('disconnect_session');
}

export async function logoutSession(): Promise<ConnectionPayload> {
  if (!isTauriRuntime()) {
    return { connected: false, message: 'Preview session unlinked.' };
  }

  return invoke<ConnectionPayload>('logout_session');
}

export async function getSessionStatus(): Promise<SessionStatusPayload> {
  if (!isTauriRuntime()) {
    return {
      connected: false,
      running: false,
      message: 'Browser preview is not connected to WhatsApp.'
    };
  }

  return invoke<SessionStatusPayload>('get_session_status');
}

export async function getAccountDevice(): Promise<AccountDevicePayload> {
  if (!isTauriRuntime()) {
    return {
      connected: false,
      loggedIn: false,
      running: false,
      deviceName: 'Browser preview',
      phoneJid: '6281299012345@s.whatsapp.net',
      lidJid: '100000012345678@lid',
      pushName: 'Preview account',
      message: 'Browser preview is not connected to WhatsApp.'
    };
  }

  return invoke<AccountDevicePayload>('get_account_device');
}

export async function resumeSavedSession(): Promise<SessionStatusPayload> {
  if (!isTauriRuntime()) {
    return {
      connected: false,
      running: false,
      message: 'Browser preview has no saved WhatsApp session.'
    };
  }

  return invoke<SessionStatusPayload>('resume_saved_session');
}

export async function sendTextMessage(chatId: string, text: string): Promise<OutgoingMessagePayload> {
  if (!isTauriRuntime()) {
    return {
      id: crypto.randomUUID(),
      chatId,
      text,
      timestampMs: Date.now()
    };
  }

  return invoke<OutgoingMessagePayload>('send_text_message', { chatId, text });
}

export async function sendTextStatus(
  text: string,
  backgroundArgb: number,
  font: number,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return {
      id: crypto.randomUUID(),
      text,
      timestampMs: Date.now()
    };
  }

  return invoke<StatusPostPayload>('send_text_status', {
    text,
    backgroundArgb,
    font,
    recipients,
    privacy
  });
}

export async function sendRawStatus(
  text: string,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: crypto.randomUUID(), text, timestampMs: Date.now() };
  }

  return invoke<StatusPostPayload>('send_raw_status', { text, recipients, privacy });
}

export async function sendImageStatus(
  data: number[],
  thumbnail: number[] | null,
  caption: string,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: crypto.randomUUID(), text: caption || 'Image status', timestampMs: Date.now() };
  }

  return invoke<StatusPostPayload>('send_image_status', {
    data,
    thumbnail,
    caption,
    recipients,
    privacy
  });
}

export async function sendVideoStatus(
  data: number[],
  thumbnail: number[],
  durationSeconds: number,
  caption: string,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: crypto.randomUUID(), text: caption || 'Video status', timestampMs: Date.now() };
  }

  return invoke<StatusPostPayload>('send_video_status', {
    data,
    thumbnail,
    durationSeconds,
    caption,
    recipients,
    privacy
  });
}

export async function revokeStatus(
  messageId: string,
  recipients: string[],
  privacy: StatusPrivacy
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: crypto.randomUUID(), text: `Revoked ${messageId}`, timestampMs: Date.now() };
  }

  return invoke<StatusPostPayload>('revoke_status', { messageId, recipients, privacy });
}

export async function sendStatusReaction(
  statusOwner: string,
  serverId: number,
  reaction: string
): Promise<StatusPostPayload> {
  if (!isTauriRuntime()) {
    return { id: String(serverId), text: reaction ? `Reacted with ${reaction}` : 'Reaction removed', timestampMs: Date.now() };
  }

  return invoke<StatusPostPayload>('send_status_reaction', { statusOwner, serverId, reaction });
}

export async function syncContacts(phones: string[]): Promise<ContactLookupPayload[]> {
  if (!isTauriRuntime()) {
    return phones.map((phone) => ({
      id: `${phone.replace(/\D/g, '')}@s.whatsapp.net`,
      phone: phone.replace(/\D/g, ''),
      about: 'Browser preview contact',
      isBusiness: false,
      isRegistered: true
    }));
  }

  return invoke<ContactLookupPayload[]>('sync_contacts', { phones });
}

export async function syncContactProfiles(jids: string[]): Promise<ContactProfilePayload[]> {
  if (!isTauriRuntime()) {
    return jids.map((jid) => ({
      id: jid,
      phone: jid.split('@')[0] ?? jid,
      about: 'Browser preview profile',
      isBusiness: false,
      updatedAtMs: Date.now()
    }));
  }

  return invoke<ContactProfilePayload[]>('sync_contact_profiles', { jids });
}

export async function syncGroupMetadata(groupIds: string[]): Promise<GroupMetadataPayload[]> {
  if (!isTauriRuntime()) {
    return groupIds.map((groupId) => ({
      id: groupId,
      subject: groupId.includes('@g.us') ? 'Browser preview group' : groupId,
      description: 'Preview group metadata',
      participantCount: 3,
      adminCount: 1,
      isLocked: false,
      isAnnouncement: false,
      participants: []
    }));
  }

  return invoke<GroupMetadataPayload[]>('sync_group_metadata', { groupIds });
}

export async function enableNotifications(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return true;
  }

  const alreadyGranted = await isPermissionGranted();
  if (alreadyGranted) {
    return true;
  }

  const permission = await requestPermission();
  return permission === 'granted';
}

export function notifyNewMessage(title: string, body: string): void {
  if (!isTauriRuntime()) {
    return;
  }

  sendNotification({ title, body });
}

export interface BridgeHandlers {
  onAuth: (payload: AuthPayload) => void;
  onConnection: (payload: ConnectionPayload) => void;
  onMessage: (payload: IncomingMessagePayload) => void;
  onHistorySync: (payload: HistorySyncPayload) => void;
  onHistoryProgress: (payload: HistorySyncProgressPayload) => void;
  onTyping: (payload: TypingPayload) => void;
  onReceipt: (payload: ReceiptPayload) => void;
}

export async function connectBridge(handlers: BridgeHandlers): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  const unlisteners = await Promise.all([
    listen<AuthPayload>('whatsmo://auth', (event) => handlers.onAuth(event.payload)),
    listen<ConnectionPayload>('whatsmo://connection', (event) => handlers.onConnection(event.payload)),
    listen<IncomingMessagePayload>('whatsmo://message', (event) => handlers.onMessage(event.payload)),
    listen<HistorySyncPayload>('whatsmo://history-sync', (event) => handlers.onHistorySync(event.payload)),
    listen<HistorySyncProgressPayload>('whatsmo://history-progress', (event) => handlers.onHistoryProgress(event.payload)),
    listen<TypingPayload>('whatsmo://typing', (event) => handlers.onTyping(event.payload)),
    listen<ReceiptPayload>('whatsmo://receipt', (event) => handlers.onReceipt(event.payload))
  ]);

  return () => {
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}
