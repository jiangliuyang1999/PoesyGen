#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-testflight}"
if [[ "${MODE}" != "testflight" && "${MODE}" != "adhoc" ]]; then
  echo "Usage: $0 [testflight|adhoc]" >&2
  exit 2
fi

if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "APPLE_TEAM_ID is required for a signed iOS package." >&2
  exit 2
fi

if ! security find-identity -v -p codesigning | grep -q '"Apple \(Development\|Distribution\):'; then
  echo "No valid Apple code-signing identity was found in the login keychain." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${MOBILE_DIR}/../.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
BUNDLE_ID="${IOS_BUNDLE_ID:-com.poesygen.app}"
OUTPUT_DIR="${ROOT_DIR}/release/ios"
ARCHIVE_PATH="${OUTPUT_DIR}/PoesyGen-${VERSION}.xcarchive"
EXPORT_DIR="${OUTPUT_DIR}/${MODE}"
EXPORT_OPTIONS="${OUTPUT_DIR}/ExportOptions-${MODE}.plist"
EXPORT_METHOD="app-store-connect"

if [[ "${MODE}" == "adhoc" ]]; then
  EXPORT_METHOD="release-testing"
fi

mkdir -p "${OUTPUT_DIR}"
rm -rf "${ARCHIVE_PATH}" "${EXPORT_DIR}"

pnpm --dir "${ROOT_DIR}" --filter @poesygen/mobile sync

xcodebuild \
  -project "${MOBILE_DIR}/ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "${ARCHIVE_PATH}" \
  DEVELOPMENT_TEAM="${APPLE_TEAM_ID}" \
  PRODUCT_BUNDLE_IDENTIFIER="${BUNDLE_ID}" \
  MARKETING_VERSION="${VERSION}" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  archive

cat >"${EXPORT_OPTIONS}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${EXPORT_METHOD}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID}</string>
</dict>
</plist>
EOF

xcodebuild \
  -exportArchive \
  -archivePath "${ARCHIVE_PATH}" \
  -exportPath "${EXPORT_DIR}" \
  -exportOptionsPlist "${EXPORT_OPTIONS}" \
  -allowProvisioningUpdates

echo "Created signed iOS package in ${EXPORT_DIR}"
