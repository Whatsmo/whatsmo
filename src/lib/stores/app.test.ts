import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { appState, selectChat, toggleChatPinned, toggleChatMuted } from './app';

describe('appState store', () => {
	it('initializes with demo data in browser mode', () => {
		const state = get(appState);
		expect(state.chats.length).toBeGreaterThan(0);
		expect(state.contacts.length).toBeGreaterThan(0);
	});

	it('has a selected chat by default', () => {
		const state = get(appState);
		expect(state.selectedChatId).toBeTruthy();
	});
});

describe('selectChat', () => {
	it('updates selectedChatId and clears unread count', () => {
		const state = get(appState);
		const chatWithUnread = state.chats.find((c) => c.unreadCount > 0);
		if (!chatWithUnread) return;

		selectChat(chatWithUnread.id);
		const updated = get(appState);
		expect(updated.selectedChatId).toBe(chatWithUnread.id);
		const chat = updated.chats.find((c) => c.id === chatWithUnread.id);
		expect(chat?.unreadCount).toBe(0);
	});
});

describe('toggleChatPinned', () => {
	it('toggles pinned state', () => {
		const state = get(appState);
		const chat = state.chats[0];
		const wasPinned = chat.pinned;

		toggleChatPinned(chat.id);
		const updated = get(appState);
		const updatedChat = updated.chats.find((c) => c.id === chat.id);
		expect(updatedChat?.pinned).toBe(!wasPinned);
	});
});

describe('toggleChatMuted', () => {
	it('toggles muted state', () => {
		const state = get(appState);
		const chat = state.chats[0];
		const wasMuted = chat.muted;

		toggleChatMuted(chat.id);
		const updated = get(appState);
		const updatedChat = updated.chats.find((c) => c.id === chat.id);
		expect(updatedChat?.muted).toBe(!wasMuted);
	});
});
