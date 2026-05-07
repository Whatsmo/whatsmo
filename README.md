# Whatsmo

Whatsmo is an Android-first WhatsApp companion client concept built with **Tauri 2**, **SvelteKit**, **Bun**, and the unofficial **whatsapp-rust** library.

The goal is not to wrap the official APK. The Rust backend talks to WhatsApp Web through `whatsapp-rust`, while the frontend provides a touch-first WhatsApp-inspired mobile UI.

> Important: `whatsapp-rust` is an unofficial WhatsApp Web implementation. Custom clients may violate Meta/WhatsApp terms and can risk account restrictions. Use test accounts while developing.

> Project status: Whatsmo is in an early experimental phase. Core pairing, runtime session resume, foreground messaging, and several Status APIs are wired, but this is not production-ready and should not be used as a primary WhatsApp client yet.

## Stack

- Bun for frontend dependency management and scripts
- SvelteKit static app for Tauri WebView rendering
- Tauri 2 for Android/mobile shell and Rust command bridge
- `whatsapp-rust` for QR pairing, phone pair-code login, events, and message sending
- Tauri notification plugin for mobile notification permission and local notifications

## Run locally

```bash
bun install
bun run check
bun run tauri dev
```

## Android path

Install the Android SDK/NDK requirements for Tauri, then run:

```bash
bun run android:setup
bun run android:init
bun run android:dev
```

This repo is configured to keep Android SDK/NDK downloads inside `.local/android-sdk`, Cargo package caches inside `.local/cargo`, and Gradle caches inside `.local/gradle` on the project drive, not in the home/root filesystem. For manual commands, use:

```bash
. ./scripts/android-env.sh
sdkmanager --version
```

For a smaller local test APK, use:

```bash
bun run android:build:apk:test
bun run android:install
```

GitHub Actions also builds this APK on `main`, pull requests, and manual dispatch. Download the `whatsmo-release-test-apk` artifact from the workflow run.

## Roadmap

Tracked via [GitHub Issues](https://github.com/Whatsmo/whatsmo/issues) and the [Whatsmo Roadmap](https://github.com/orgs/Whatsmo/projects/1) project board.

### What's working

- QR and pair-code authentication with session resume
- Real-time messaging (text, media, reactions, edits, deletes, replies)
- History sync from WhatsApp
- Group metadata, participant lists, and sender attribution
- Status posting (text, image, video) with privacy modes and viewer
- Media upload/download (image, video, document, audio, sticker)
- Forwarded labels, polls, location shares, and contact cards
- Foreground notifications with chat routing
- Offline message queue with retry
- WhatsApp Android 1:1 UI across all screens
- Browser preview with comprehensive demo data

### Open issues

See [open issues](https://github.com/Whatsmo/whatsmo/issues) for remaining work including push notifications, accessibility, testing, and release infrastructure.

## License

MIT
