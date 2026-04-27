#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
. "$ROOT_DIR/scripts/android-env.sh"

CMDLINE_TOOLS_URL="${CMDLINE_TOOLS_URL:-https://dl.google.com/android/repository/commandlinetools-linux-14742923_latest.zip}"
CMDLINE_TOOLS_ZIP="$ROOT_DIR/.local/downloads/commandlinetools-linux-latest.zip"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

mkdir -p \
  "$ANDROID_HOME/cmdline-tools" \
  "$ANDROID_HOME/licenses" \
  "$ROOT_DIR/.local/downloads" \
  "$TMPDIR" \
  "$GRADLE_USER_HOME" \
  "$CARGO_HOME"

if [ ! -x "$SDKMANAGER" ]; then
  echo "Installing Android command-line tools into $ANDROID_HOME..."
  curl --fail --location --output "$CMDLINE_TOOLS_ZIP" "$CMDLINE_TOOLS_URL"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest" "$ANDROID_HOME/cmdline-tools/cmdline-tools"
  unzip -q "$CMDLINE_TOOLS_ZIP" -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi

echo "Accepting Android SDK licenses..."
yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/dev/null

echo "Installing Android SDK packages into $ANDROID_HOME..."
yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;35.0.0" \
  "ndk;27.0.12077973"

echo "Android SDK ready at $ANDROID_HOME"
