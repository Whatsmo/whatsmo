#!/usr/bin/env sh

# Source this file before running Android/Tauri commands manually:
# . ./scripts/android-env.sh

export ANDROID_HOME="$PWD/.local/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export NDK_HOME="$ANDROID_NDK_HOME"
export CARGO_HOME="$PWD/.local/cargo"
export GRADLE_USER_HOME="$PWD/.local/gradle"
export TMPDIR="$PWD/.local/tmp"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
