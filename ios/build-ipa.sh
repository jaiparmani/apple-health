#!/usr/bin/env bash
# Builds an installable HealthSync.ipa for sideloading (Sideloadly / AltStore
# re-sign it with your Apple ID). The app is built unsigned, then ad-hoc signed
# with its entitlements so HealthKit + the App Group survive the re-sign.
#
# Usage: ios/build-ipa.sh [build-number]   → writes ios/build/HealthSync.ipa
set -euo pipefail

cd "$(dirname "$0")"
BUILD_NUMBER="${1:-$(date +%Y%m%d%H%M)}"
OUT="$PWD/build"
rm -rf "$OUT"
mkdir -p "$OUT"

xcodebuild \
  -project HealthSync.xcodeproj \
  -scheme HealthSync \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$OUT/dd" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  build | tail -n 40

APP="$OUT/dd/Build/Products/Release-iphoneos/HealthSync.app"
[ -d "$APP" ] || { echo "build produced no .app" >&2; exit 1; }

# Sign inside-out: widget extension first, then the app.
for ext in "$APP"/PlugIns/*.appex; do
  [ -d "$ext" ] || continue
  codesign -f -s - --entitlements HealthSyncWidgetExtension.entitlements "$ext"
done
codesign -f -s - --entitlements HealthSync/HealthSync.entitlements "$APP"

mkdir -p "$OUT/Payload"
cp -R "$APP" "$OUT/Payload/"
(cd "$OUT" && zip -qry HealthSync.ipa Payload)
echo "IPA: $OUT/HealthSync.ipa (build $BUILD_NUMBER)"
