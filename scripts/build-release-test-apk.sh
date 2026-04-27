#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
. "$ROOT_DIR/scripts/android-env.sh"

UNSIGNED_APK="$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
SIGNED_APK="$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-test.apk"
ALIGNED_APK="$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-test-aligned.apk"
PROJECT_KEYSTORE="$ROOT_DIR/.local/keystores/whatsmo-debug-release.keystore"
ANDROID_DEBUG_KEYSTORE="${ANDROID_DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"

bun run android:build:apk

if [ -f "$ANDROID_DEBUG_KEYSTORE" ]; then
  KEYSTORE="$ANDROID_DEBUG_KEYSTORE"
else
  KEYSTORE="$PROJECT_KEYSTORE"
fi

mkdir -p "$(dirname "$KEYSTORE")"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair \
    -v \
    -keystore "$KEYSTORE" \
    -storepass android \
    -alias androiddebugkey \
    -keypass android \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US"
fi

"$ANDROID_HOME/build-tools/35.0.0/zipalign" -p -f 4 "$UNSIGNED_APK" "$ALIGNED_APK"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out "$SIGNED_APK" \
  "$ALIGNED_APK"

rm -f "$ALIGNED_APK"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose "$SIGNED_APK" >/dev/null

printf 'Built signed release-test APK: %s\n' "$SIGNED_APK"
printf 'Signed with keystore: %s\n' "$KEYSTORE"
