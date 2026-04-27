export type AuthMode = 'idle' | 'qr' | 'pair-code' | 'connecting' | 'connected' | 'logged-out' | 'error';

export interface AuthPayload {
  mode: AuthMode;
  qrCode?: string;
  pairCode?: string;
  phoneNumber?: string;
  message?: string;
}

export interface ConnectionPayload {
  connected: boolean;
  message: string;
}

export interface SessionStatusPayload {
  connected: boolean;
  running: boolean;
  message: string;
}

export interface AccountDevicePayload {
  connected: boolean;
  loggedIn: boolean;
  running: boolean;
  deviceName: string;
  phoneJid?: string;
  lidJid?: string;
  pushName?: string;
  message: string;
}

export type ChatKind = 'direct' | 'group';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'played' | 'failed';
export type MediaKind = 'image' | 'video' | 'document' | 'audio';
export type MessageEventKind = 'message' | 'edit' | 'revoke' | 'admin-revoke' | 'other';
export type StatusPrivacy = 'contacts' | 'allowlist' | 'denylist';

export interface ContactProfile {
  id: string;
  name: string;
  phone: string;
  about: string;
  avatarGradient: string;
  isBusiness?: boolean;
  isOnline?: boolean;
}

export interface MediaAttachment {
  id: string;
  kind: MediaKind;
  name: string;
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  timestamp: number;
  fromMe: boolean;
  status: MessageStatus;
  deleted?: boolean;
  edited?: boolean;
  media?: MediaAttachment;
}

export interface ChatSummary {
  id: string;
  kind: ChatKind;
  title: string;
  subtitle: string;
  unreadCount: number;
  muted: boolean;
  pinned: boolean;
  avatarGradient: string;
  lastMessageAt: number;
  participantCount?: number;
  typing?: string;
}

export interface IncomingMessagePayload {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  timestampMs: number;
  isGroup: boolean;
  fromMe: boolean;
  eventKind: MessageEventKind;
  targetMessageId?: string;
}

export interface HistorySyncPayload {
  chatId: string;
  title: string;
  unreadCount: number;
  lastMessageAt: number;
  isGroup: boolean;
  messages: IncomingMessagePayload[];
}

export interface HistorySyncProgressPayload {
  active: boolean;
  total: number;
  processed: number;
  messages: number;
  notifications: number;
  receipts: number;
  message: string;
}

export interface OutgoingMessagePayload {
  id: string;
  chatId: string;
  text: string;
  timestampMs: number;
}

export interface StatusPostPayload {
  id: string;
  text: string;
  timestampMs: number;
}

export interface ContactLookupPayload {
  id: string;
  phone: string;
  lid?: string;
  about?: string;
  isBusiness: boolean;
  isRegistered: boolean;
}

export interface TypingPayload {
  chatId: string;
  name: string;
  isTyping: boolean;
}

export interface ReceiptPayload {
  chatId: string;
  messageId: string;
  status: MessageStatus;
}

export interface AppModel {
  auth: AuthPayload;
  account: AccountDevicePayload | null;
  historySync: HistorySyncProgressPayload | null;
  chats: ChatSummary[];
  messages: Record<string, ChatMessage[]>;
  contacts: ContactProfile[];
  selectedChatId: string;
  notificationEnabled: boolean;
}
