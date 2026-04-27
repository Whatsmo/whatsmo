#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Keep Android SDK, Gradle, Cargo, and temp usage on the project drive.
# shellcheck disable=SC1091
. "$ROOT_DIR/scripts/android-env.sh"

DEFAULT_RELEASE_TEST_APK="$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-test.apk"
DEFAULT_DEBUG_APK="$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
APK_PATH="${APK_PATH:-$DEFAULT_RELEASE_TEST_APK}"
PACKAGE_NAME="${PACKAGE_NAME:-com.whatsmo.mobile}"
ACTIVITY_NAME="${ACTIVITY_NAME:-.MainActivity}"
LAUNCH_AFTER_INSTALL="${LAUNCH_AFTER_INSTALL:-1}"
BUILD_IF_MISSING="${BUILD_IF_MISSING:-0}"

usage() {
  cat <<'EOF'
Usage: scripts/install-apk.sh [options]

Installs the latest small Whatsmo release-test APK using the project-local Android SDK.

Options:
  --build          Build the smaller release-test APK first if it is missing
  --no-launch      Install only; do not launch the app
  --device ID      Install to a specific adb device ID
  --apk PATH       Install a specific APK path
  -h, --help       Show this help

Environment overrides:
  DEVICE_ID=...              Same as --device
  APK_PATH=...               Same as --apk
  LAUNCH_AFTER_INSTALL=0     Same as --no-launch
  BUILD_IF_MISSING=1         Same as --build

Examples:
  scripts/install-apk.sh
  scripts/install-apk.sh --build
  scripts/install-apk.sh --device 133157053M004716
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --build)
      BUILD_IF_MISSING=1
      shift
      ;;
    --no-launch)
      LAUNCH_AFTER_INSTALL=0
      shift
      ;;
    --device)
      DEVICE_ID="${2:-}"
      if [ -z "$DEVICE_ID" ]; then
        echo "Missing value for --device" >&2
        exit 2
      fi
      shift 2
      ;;
    --apk)
      APK_PATH="${2:-}"
      if [ -z "$APK_PATH" ]; then
        echo "Missing value for --apk" >&2
        exit 2
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ ! -f "$APK_PATH" ]; then
  if [ "$BUILD_IF_MISSING" = "1" ]; then
    scripts/build-release-test-apk.sh
  else
    if [ "$APK_PATH" = "$DEFAULT_RELEASE_TEST_APK" ] && [ -f "$DEFAULT_DEBUG_APK" ]; then
      APK_PATH="$DEFAULT_DEBUG_APK"
    else
      echo "APK not found: $APK_PATH" >&2
      echo "Run: scripts/build-release-test-apk.sh" >&2
      echo "Or:  scripts/install-apk.sh --build" >&2
      exit 1
    fi
  fi
fi

if [ ! -x "$ANDROID_HOME/platform-tools/adb" ]; then
  echo "adb not found at $ANDROID_HOME/platform-tools/adb" >&2
  exit 1
fi

ADB=("$ANDROID_HOME/platform-tools/adb")
if [ -n "${DEVICE_ID:-}" ]; then
  ADB+=("-s" "$DEVICE_ID")
fi

echo "Checking connected Android device..."
"${ADB[@]}" get-state >/dev/null

echo "Installing: $APK_PATH"
"${ADB[@]}" install -r -d -g --no-streaming "$APK_PATH"

if [ "$LAUNCH_AFTER_INSTALL" = "1" ]; then
  echo "Launching $PACKAGE_NAME/$ACTIVITY_NAME..."
  "${ADB[@]}" shell am start -n "$PACKAGE_NAME/$ACTIVITY_NAME"
fi

echo "Done."
