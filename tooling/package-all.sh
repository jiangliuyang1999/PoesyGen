#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"

BUILD_DMG=true
BUILD_SIGNED=false
RUN_CHECKS=true
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: pnpm package:all [-- --skip-dmg] [-- --signed] [-- --skip-checks] [-- --dry-run]

Options:
  --skip-dmg     Skip the macOS DMG and only build the universal ZIP.
  --signed       Also build signed Android release APK/AAB and iOS TestFlight IPA.
  --skip-checks  Skip format, type, test, data, and production-build checks.
  --dry-run      Print the commands without executing them.
  -h, --help     Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      ;;
    --skip-dmg)
      BUILD_DMG=false
      ;;
    --signed)
      BUILD_SIGNED=true
      ;;
    --skip-checks)
      RUN_CHECKS=false
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

run() {
  printf '\n==> %s\n' "$1"
  shift
  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '    '
    printf '%q ' "$@"
    printf '\n'
    return
  fi
  "$@"
}

require_environment() {
  local missing=()
  local variable
  for variable in "$@"; do
    if [[ -z "${!variable:-}" ]]; then
      missing+=("${variable}")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    printf 'Missing required environment variables: %s\n' "${missing[*]}" >&2
    exit 2
  fi
}

verify_versions() {
  node - "${ROOT_DIR}" "${VERSION}" <<'NODE'
const path = require('node:path');

const [root, expected] = process.argv.slice(2);
const manifests = [
  'package.json',
  'apps/cli/package.json',
  'apps/desktop/package.json',
  'apps/mobile/package.json',
  'apps/web/package.json',
];
for (const manifest of manifests) {
  const version = require(path.join(root, manifest)).version;
  if (version !== expected) {
    throw new Error(`${manifest} version ${version} does not match ${expected}`);
  }
}
NODE
}

clean_outputs() {
  rm -f \
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-mac-universal.zip" \
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-mac-universal.zip.blockmap" \
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-mac-universal.dmg" \
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-mac-universal.dmg.blockmap" \
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-win-x64.exe" \
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-win-x64.exe.blockmap" \
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-win-x64.zip" \
    "${ROOT_DIR}/release/android/PoesyGen-${VERSION}-android-debug.apk" \
    "${ROOT_DIR}/release/android/PoesyGen-${VERSION}-android-release.apk" \
    "${ROOT_DIR}/release/android/PoesyGen-${VERSION}-android-release.aab" \
    "${ROOT_DIR}/release/ios/PoesyGen-${VERSION}-ios-simulator.zip" \
    "${ROOT_DIR}/release/SHA256SUMS"
  rm -rf "${ROOT_DIR}/release/ios/testflight"
}

write_checksums() {
  local artifacts=(
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-mac-universal.zip"
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-win-x64.exe"
    "${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-win-x64.zip"
    "${ROOT_DIR}/release/android/PoesyGen-${VERSION}-android-debug.apk"
    "${ROOT_DIR}/release/ios/PoesyGen-${VERSION}-ios-simulator.zip"
  )
  if [[ "${BUILD_DMG}" == "true" ]]; then
    artifacts+=("${ROOT_DIR}/release/desktop/PoesyGen-${VERSION}-mac-universal.dmg")
  fi
  if [[ "${BUILD_SIGNED}" == "true" ]]; then
    local ipa_count=0
    artifacts+=(
      "${ROOT_DIR}/release/android/PoesyGen-${VERSION}-android-release.apk"
      "${ROOT_DIR}/release/android/PoesyGen-${VERSION}-android-release.aab"
    )
    while IFS= read -r ipa; do
      artifacts+=("${ipa}")
      ipa_count=$((ipa_count + 1))
    done < <(find "${ROOT_DIR}/release/ios/testflight" -maxdepth 1 -type f -name '*.ipa' | sort)
    if [[ ${ipa_count} -eq 0 ]]; then
      echo "Expected iOS TestFlight IPA was not created." >&2
      exit 1
    fi
  fi

  local artifact
  for artifact in "${artifacts[@]}"; do
    if [[ ! -f "${artifact}" ]]; then
      echo "Expected release artifact was not created: ${artifact}" >&2
      exit 1
    fi
  done

  (
    cd "${ROOT_DIR}"
    local relative_artifacts=()
    for artifact in "${artifacts[@]}"; do
      relative_artifacts+=("${artifact#"${ROOT_DIR}/"}")
    done
    shasum -a 256 "${relative_artifacts[@]}" >release/SHA256SUMS
    shasum -a 256 -c release/SHA256SUMS
  )
}

cd "${ROOT_DIR}"

printf 'PoesyGen v%s all-platform release\n' "${VERSION}"
verify_versions

if [[ "${DRY_RUN}" == "false" && -n "${TRAE_SANDBOX_SBOX_ID:-}" ]]; then
  echo "All-platform packaging must run in the macOS system Terminal, not the TRAE terminal." >&2
  echo "TRAE blocks the hdiutil and Swift Package Manager sandbox operations used by DMG and iOS builds." >&2
  exit 2
fi

if [[ "${BUILD_SIGNED}" == "true" && "${DRY_RUN}" == "false" ]]; then
  require_environment \
    ANDROID_KEYSTORE_PATH \
    ANDROID_KEYSTORE_PASSWORD \
    ANDROID_KEY_ALIAS \
    ANDROID_KEY_PASSWORD \
    APPLE_TEAM_ID
fi

if [[ "${RUN_CHECKS}" == "true" ]]; then
  run "Install dependencies" pnpm install --frozen-lockfile
  run "Verify authoritative data" pnpm data:check
  run "Check formatting" pnpm format:check
  run "Check types" pnpm typecheck
  run "Run tests" pnpm test
  run "Build production code" pnpm build
fi

if [[ "${DRY_RUN}" == "false" ]]; then
  clean_outputs
fi

run "Generate unified icons" pnpm icons:generate
run "Build macOS universal ZIP" pnpm package:mac
if [[ "${BUILD_DMG}" == "true" ]]; then
  run "Build macOS universal DMG" pnpm package:mac:dmg
fi
run "Build Windows x64 installer and ZIP" pnpm package:win
run "Build Android debug APK" pnpm package:android:test
run "Build iOS Simulator ZIP" pnpm package:ios:simulator

if [[ "${BUILD_SIGNED}" == "true" ]]; then
  run "Build signed Android release APK" pnpm package:android:apk
  run "Build signed Android release AAB" pnpm package:android:aab
  run "Build iOS TestFlight package" pnpm package:ios:testflight
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '\nDry run complete. No files were changed.\n'
  exit 0
fi

run "Write and verify SHA-256 checksums" write_checksums

printf '\nPoesyGen v%s release completed.\n' "${VERSION}"
printf 'Artifacts: %s\n' "${ROOT_DIR}/release"
