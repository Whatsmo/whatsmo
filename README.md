# Whatsmo

Whatsmo is an Android-first WhatsApp companion client concept built with **Tauri 2**, **SvelteKit**, **Bun**, and the unofficial **whatsapp-rust** library.

The goal is not to wrap the official APK. The Rust backend talks to WhatsApp Web through `whatsapp-rust`, while the frontend provides a touch-first WhatsApp-inspired mobile UI.

> Important: `whatsapp-rust` is an unofficial WhatsApp Web implementation. Custom clients may violate Meta/WhatsApp terms and can risk account restrictions. Use test accounts while developing.

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

## Current MVP slice

- QR authentication command bridge
- Phone-number pair-code authentication command bridge
- WhatsApp event bridge into Svelte stores
- Chat list, group/direct conversation UI, media preview affordance
- Text message send path through `whatsapp-rust`
- Read/delivery status UI model, typing state model, and notification permission flow

Media upload/download, persisted chat history rendering, contact/profile sync, and push notification delivery can be layered on this foundation next.

## License

MIT
