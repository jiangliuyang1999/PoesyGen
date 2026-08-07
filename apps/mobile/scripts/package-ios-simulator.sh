#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${MOBILE_DIR}/../.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
OUTPUT_DIR="${ROOT_DIR}/release/ios"
DERIVED_DATA="${OUTPUT_DIR}/DerivedData"
APP_PATH="${DERIVED_DATA}/Build/Products/Release-iphonesimulator/App.app"
ARCHIVE_PATH="${OUTPUT_DIR}/PoesyGen-${VERSION}-ios-simulator.zip"

mkdir -p "${OUTPUT_DIR}"
rm -rf "${DERIVED_DATA}" "${ARCHIVE_PATH}"

pnpm --dir "${ROOT_DIR}" --filter @poesygen/mobile sync

xcodebuild \
  -project "${MOBILE_DIR}/ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Release \
  -sdk iphonesimulator \
  -derivedDataPath "${DERIVED_DATA}" \
  MARKETING_VERSION="${VERSION}" \
  CODE_SIGNING_ALLOWED=NO \
  build

ditto -c -k --sequesterRsrc --keepParent "${APP_PATH}" "${ARCHIVE_PATH}"
rm -rf "${DERIVED_DATA}"

echo "Created ${ARCHIVE_PATH}"
