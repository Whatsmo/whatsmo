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
export type MediaKind = 'image' | 'video' | 'document' | 'audio' | 'sticker';
export type MessageEventKind = 'message' | 'edit' | 'revoke' | 'admin-revoke' | 'other';
export type StatusPrivacy = 'contacts' | 'allowlist' | 'denylist';

export interface ContactProfile {
  id: string;
  name: string;
  phone: string;
  about: string;
  avatarGradient: string;
  avatarUrl?: string;
  lid?: string;
  pictureId?: string;
  profileUpdatedAt?: number;
  isBusiness?: boolean;
  isOnline?: boolean;
}

export interface MediaAttachment {
  id: string;
  kind: MediaKind;
  name: string;
  previewUrl?: string;
  cachedDataUrl?: string;
  cachedAt?: number;
  mimeType?: string;
  directPath?: string;
  mediaKey?: number[];
  fileSha256?: number[];
  fileEncSha256?: number[];
  fileLength?: number;
  thumbnail?: number[];
  viewOnce?: boolean;
  ptt?: boolean;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  text?: string;
  timestamp: number;
  fromMe: boolean;
  status: MessageStatus;
  deleted?: boolean;
  edited?: boolean;
  media?: MediaAttachment;
  quotedMessageId?: string;
  quotedSenderName?: string;
  quotedText?: string;
  quotedMediaKind?: MediaKind;
  quotedMediaPreviewUrl?: string;
  reactions?: Array<{ emoji: string; senderId: string }>;
  deletedBySender?: boolean;
  editHistory?: string[];
}

export interface ChatSummary {
  id: string;
  kind: ChatKind;
  title: string;
  subtitle: string;
  unreadCount: number;
  muted: boolean;
  pinned: boolean;
  archived?: boolean;
  avatarGradient: string;
  avatarUrl?: string;
  lastMessageAt: number;
  participantCount?: number;
  groupDescription?: string;
  groupAdminCount?: number;
  groupIsLocked?: boolean;
  groupIsAnnouncement?: boolean;
  typing?: string;
}

export interface StatusSummary {
  senderId: string;
  name: string;
  avatarGradient: string;
  avatarUrl?: string;
  lastUpdatedAt: number;
  unreadCount: number;
  items: ChatMessage[];
}

export interface GroupParticipantProfile {
  id: string;
  phoneNumber?: string;
  isAdmin: boolean;
}

export interface GroupMetadataPayload {
  id: string;
  subject: string;
  avatarUrl?: string;
  description?: string;
  participantCount: number;
  adminCount: number;
  isLocked: boolean;
  isAnnouncement: boolean;
  creator?: string;
  createdAtMs?: number;
  participants: GroupParticipantProfile[];
}

export interface IncomingMessagePayload {
  id: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  text?: string;
  timestampMs: number;
  isGroup: boolean;
  fromMe: boolean;
  eventKind: MessageEventKind;
  targetMessageId?: string;
  media?: MediaAttachment;
  quotedMessageId?: string;
  quotedSenderName?: string;
  quotedText?: string;
  quotedMediaKind?: MediaKind;
  quotedMediaPreviewUrl?: string;
}

export interface IncomingReactionPayload {
  chatId: string;
  targetMessageId: string;
  senderId: string;
  emoji: string;
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

export interface OutgoingMediaPayload {
  id: string;
  chatId: string;
  kind: MediaKind;
  name: string;
  caption?: string;
  timestampMs: number;
}

export interface DownloadedMediaPayload {
  kind: MediaKind;
  name: string;
  mimeType: string;
  size: number;
  data: number[];
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

export interface ContactProfilePayload {
  id: string;
  phone: string;
  lid?: string;
  about?: string;
  pictureId?: string;
  avatarUrl?: string;
  isBusiness: boolean;
  updatedAtMs: number;
}

export interface ContactUpdatedPayload {
  jid: string;
  pushName?: string;
  timestampMs: number;
}

export interface ContactNumberChangedPayload {
  oldJid: string;
  newJid: string;
  oldLid?: string;
  newLid?: string;
  timestampMs: number;
}

export interface ContactSyncRequestedPayload {
  afterMs?: number;
  timestampMs: number;
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

export type ThemeMode = 'light' | 'dark' | 'system';

export interface PowerFeatures {
  antiDelete: boolean;
  antiEdit: boolean;
  autoForwardDeleted: boolean;
  forwardTargetId: string;
}

export interface AppModel {
  auth: AuthPayload;
  account: AccountDevicePayload | null;
  historySync: HistorySyncProgressPayload | null;
  chats: ChatSummary[];
  messages: Record<string, ChatMessage[]>;
  statuses: Record<string, ChatMessage[]>;
  contacts: ContactProfile[];
  groups: Record<string, GroupMetadataPayload>;
  selectedChatId: string;
  notificationEnabled: boolean;
  showGroupAvatars: boolean;
  theme: ThemeMode;
  chatEphemeralDefaults: Record<string, number>;
  powerFeatures: PowerFeatures;
}
