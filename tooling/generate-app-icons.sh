#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE="${ROOT_DIR}/apps/desktop/build/icon.svg"
DESKTOP_DIR="${ROOT_DIR}/apps/desktop/build"
WEB_DIR="${ROOT_DIR}/apps/web/public"
IOS_ICON_DIR="${ROOT_DIR}/apps/mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset"
IOS_SPLASH_DIR="${ROOT_DIR}/apps/mobile/ios/App/App/Assets.xcassets/Splash.imageset"
ANDROID_RES_DIR="${ROOT_DIR}/apps/mobile/android/app/src/main/res"
TEMP_DIR="$(mktemp -d)"

trap 'rm -rf "${TEMP_DIR}"' EXIT

for command in sips iconutil node; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required to generate application icons." >&2
    exit 2
  fi
done

mkdir -p "${WEB_DIR}" "${IOS_ICON_DIR}"

MASTER_PNG="${TEMP_DIR}/app-icon.png"
sips -s format png "${SOURCE}" --out "${MASTER_PNG}" >/dev/null
cp "${MASTER_PNG}" "${DESKTOP_DIR}/icon.png"

resize() {
  local source="$1"
  local size="$2"
  local output="$3"
  sips -z "${size}" "${size}" "${source}" --out "${output}" >/dev/null
}

make_splash() {
  local width="$1"
  local height="$2"
  local icon_size="$3"
  local output="$4"
  local icon="${TEMP_DIR}/splash-icon-${width}x${height}.png"
  resize "${MASTER_PNG}" "${icon_size}" "${icon}"
  sips -p "${height}" "${width}" --padColor F3EFE6 "${icon}" --out "${output}" >/dev/null 2>&1
}

ICONSET="${TEMP_DIR}/PoesyGen.iconset"
mkdir -p "${ICONSET}"
resize "${MASTER_PNG}" 16 "${ICONSET}/icon_16x16.png"
resize "${MASTER_PNG}" 32 "${ICONSET}/icon_16x16@2x.png"
resize "${MASTER_PNG}" 32 "${ICONSET}/icon_32x32.png"
resize "${MASTER_PNG}" 64 "${ICONSET}/icon_32x32@2x.png"
resize "${MASTER_PNG}" 128 "${ICONSET}/icon_128x128.png"
resize "${MASTER_PNG}" 256 "${ICONSET}/icon_128x128@2x.png"
resize "${MASTER_PNG}" 256 "${ICONSET}/icon_256x256.png"
resize "${MASTER_PNG}" 512 "${ICONSET}/icon_256x256@2x.png"
resize "${MASTER_PNG}" 512 "${ICONSET}/icon_512x512.png"
cp "${MASTER_PNG}" "${ICONSET}/icon_512x512@2x.png"
iconutil -c icns "${ICONSET}" -o "${DESKTOP_DIR}/icon.icns"

WINDOWS_PNG="${TEMP_DIR}/icon-256.png"
resize "${MASTER_PNG}" 256 "${WINDOWS_PNG}"
node - "${WINDOWS_PNG}" "${DESKTOP_DIR}/icon.ico" <<'NODE'
const fs = require('node:fs');

const [input, output] = process.argv.slice(2);
const png = fs.readFileSync(input);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(0, 6);
header.writeUInt8(0, 7);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(header.length, 18);
fs.writeFileSync(output, Buffer.concat([header, png]));
NODE

cp "${SOURCE}" "${WEB_DIR}/favicon.svg"
cp "${DESKTOP_DIR}/icon.ico" "${WEB_DIR}/favicon.ico"
resize "${MASTER_PNG}" 32 "${WEB_DIR}/favicon-32x32.png"
resize "${MASTER_PNG}" 192 "${WEB_DIR}/app-icon-192.png"
resize "${MASTER_PNG}" 512 "${WEB_DIR}/app-icon-512.png"

OPAQUE_SVG="${TEMP_DIR}/app-icon-opaque.svg"
awk 'NR == 1 {
  print
  print "  <rect width=\"1024\" height=\"1024\" fill=\"#9f3c2f\"/>"
  next
}
{ print }' "${SOURCE}" >"${OPAQUE_SVG}"
sips -s format png "${OPAQUE_SVG}" --out "${TEMP_DIR}/app-icon-opaque.png" >/dev/null
sips \
  -s format jpeg \
  -s formatOptions 100 \
  "${TEMP_DIR}/app-icon-opaque.png" \
  --out "${TEMP_DIR}/app-icon-opaque.jpg" \
  >/dev/null
sips \
  -s format png \
  "${TEMP_DIR}/app-icon-opaque.jpg" \
  --out "${IOS_ICON_DIR}/AppIcon-512@2x.png" \
  >/dev/null
resize "${IOS_ICON_DIR}/AppIcon-512@2x.png" 180 "${WEB_DIR}/apple-touch-icon.png"

for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  mkdir -p "${ANDROID_RES_DIR}/mipmap-${density}"
done

for spec in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  IFS=: read -r density legacy_size foreground_size <<<"${spec}"
  resize "${MASTER_PNG}" "${legacy_size}" "${ANDROID_RES_DIR}/mipmap-${density}/ic_launcher.png"
  resize "${MASTER_PNG}" "${legacy_size}" "${ANDROID_RES_DIR}/mipmap-${density}/ic_launcher_round.png"
  resize \
    "${MASTER_PNG}" \
    "${foreground_size}" \
    "${ANDROID_RES_DIR}/mipmap-${density}/ic_launcher_foreground.png"
done

make_splash 2732 2732 420 "${IOS_SPLASH_DIR}/splash-2732x2732.png"
cp "${IOS_SPLASH_DIR}/splash-2732x2732.png" "${IOS_SPLASH_DIR}/splash-2732x2732-1.png"
cp "${IOS_SPLASH_DIR}/splash-2732x2732.png" "${IOS_SPLASH_DIR}/splash-2732x2732-2.png"

make_splash 480 320 72 "${ANDROID_RES_DIR}/drawable/splash.png"
make_splash 480 320 72 "${ANDROID_RES_DIR}/drawable-land-mdpi/splash.png"
make_splash 800 480 108 "${ANDROID_RES_DIR}/drawable-land-hdpi/splash.png"
make_splash 1280 720 160 "${ANDROID_RES_DIR}/drawable-land-xhdpi/splash.png"
make_splash 1600 960 216 "${ANDROID_RES_DIR}/drawable-land-xxhdpi/splash.png"
make_splash 1920 1280 288 "${ANDROID_RES_DIR}/drawable-land-xxxhdpi/splash.png"
make_splash 320 480 72 "${ANDROID_RES_DIR}/drawable-port-mdpi/splash.png"
make_splash 480 800 108 "${ANDROID_RES_DIR}/drawable-port-hdpi/splash.png"
make_splash 720 1280 160 "${ANDROID_RES_DIR}/drawable-port-xhdpi/splash.png"
make_splash 960 1600 216 "${ANDROID_RES_DIR}/drawable-port-xxhdpi/splash.png"
make_splash 1280 1920 288 "${ANDROID_RES_DIR}/drawable-port-xxxhdpi/splash.png"

echo "Generated unified Web, desktop, iOS, and Android icons."
