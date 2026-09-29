#!/bin/sh
# Regenerates the Chrome Web Store screenshots in store/ from the real pages,
# rendered as plain files with a stubbed chrome API (screenshot-stub.js).
# The store's API can't update listing images, so upload the results in the
# developer dashboard afterwards. Set CHROME if Chrome isn't in the usual place.
set -eu
cd "$(dirname "$0")/.."

MAC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -z "${CHROME:-}" ]; then
  if [ -x "$MAC_CHROME" ]; then CHROME="$MAC_CHROME"; else CHROME=google-chrome; fi
fi
# The store's required screenshot size
SIZE=1280,800
# Headless Chrome's virtual clock only runs while idle, so this is a cap on
# waiting for photos and icons to load, not a fixed delay
TIME_BUDGET_MS=10000

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp ./*.html ./*.js ./*.css "$work"/
ln -s "$PWD/images" "$work/images"
ln -s "$PWD/icons" "$work/icons"
cp scripts/screenshot-stub.js "$work/stub.js"
for page in "$work"/*.html; do
  sed -i.bak 's#<head>#<head><script src="stub.js"></script>#' "$page"
done

# shot <name> <page> <date> <photo> <look json> [extra query]
shot() {
  look=$(printf %s "$5" | jq -sRr @uri)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --window-size="$SIZE" --virtual-time-budget="$TIME_BUDGET_MS" \
    --screenshot="$PWD/store/$1.png" \
    "file://$work/$2?date=$3&photo=$4&look=$look${6:+&$6}" 2>/dev/null
  echo "store/$1.png"
}

# One season per shot, each in a different preset to show the range, on a
# photo that says the season at a glance: red forest path, cherry tree in
# bloom, beach umbrellas, snowy firs
shot screenshot-new-tab-autumn new-tab.html 2026-10-14 9 \
  '{"layout":"corners","attached":true,"density":"comfortable","style":"auto","blur":12,"corners":1.75}'
shot screenshot-new-tab-winter new-tab.html 2026-01-14 21 \
  '{"layout":"corners","attached":false,"density":"spacious","style":"light","blur":24,"corners":1.75}'
shot screenshot-new-tab-spring new-tab.html 2026-04-14 34 \
  '{"layout":"corners","attached":true,"density":"compact","style":"dark","blur":24,"corners":0}'
shot screenshot-new-tab-summer new-tab.html 2026-07-14 40 \
  '{"layout":"center","attached":true,"density":"spacious","style":"auto","blur":18,"corners":1.75}'
shot screenshot-options options.html 2026-10-14 9 \
  '{"layout":"corners","style":"auto","blur":12,"corners":1.75}' tab=look
