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

export type ChatKind = 'direct' | 'group';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'played' | 'failed';
export type MediaKind = 'image' | 'video' | 'document' | 'audio';
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
  chats: ChatSummary[];
  messages: Record<string, ChatMessage[]>;
  contacts: ContactProfile[];
  selectedChatId: string;
  notificationEnabled: boolean;
}
