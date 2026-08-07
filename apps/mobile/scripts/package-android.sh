#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-debug-apk}"
if [[ "${MODE}" != "debug-apk" && "${MODE}" != "release-apk" && "${MODE}" != "release-aab" ]]; then
  echo "Usage: $0 [debug-apk|release-apk|release-aab]" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${MOBILE_DIR}/../.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
OUTPUT_DIR="${ROOT_DIR}/release/android"
export APP_VERSION_NAME="${APP_VERSION_NAME:-${VERSION}}"
export APP_VERSION_CODE="${APP_VERSION_CODE:-1}"

if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "${HOME}/Library/Android/sdk" ]]; then
    export ANDROID_HOME="${HOME}/Library/Android/sdk"
  elif [[ -d "${HOME}/Android/Sdk" ]]; then
    export ANDROID_HOME="${HOME}/Android/Sdk"
  elif [[ -d "/opt/homebrew/share/android-commandlinetools" ]]; then
    export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
  else
    echo "ANDROID_HOME is not set and no default Android SDK was found." >&2
    exit 2
  fi
fi
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME}}"

if [[ "${MODE}" != "debug-apk" ]]; then
  for variable in ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
    if [[ -z "${!variable:-}" ]]; then
      echo "${variable} is required for a signed Android release." >&2
      exit 2
    fi
  done
fi

mkdir -p "${OUTPUT_DIR}"
pnpm --dir "${ROOT_DIR}" --filter @poesygen/mobile sync

case "${MODE}" in
  debug-apk)
    TASK="assembleDebug"
    SOURCE="${MOBILE_DIR}/android/app/build/outputs/apk/debug/app-debug.apk"
    TARGET="${OUTPUT_DIR}/PoesyGen-${VERSION}-android-debug.apk"
    ;;
  release-apk)
    TASK="assembleRelease"
    SOURCE="${MOBILE_DIR}/android/app/build/outputs/apk/release/app-release.apk"
    TARGET="${OUTPUT_DIR}/PoesyGen-${VERSION}-android-release.apk"
    ;;
  release-aab)
    TASK="bundleRelease"
    SOURCE="${MOBILE_DIR}/android/app/build/outputs/bundle/release/app-release.aab"
    TARGET="${OUTPUT_DIR}/PoesyGen-${VERSION}-android-release.aab"
    ;;
esac

"${MOBILE_DIR}/android/gradlew" -p "${MOBILE_DIR}/android" "${TASK}"
cp "${SOURCE}" "${TARGET}"

echo "Created ${TARGET}"
