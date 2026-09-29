#!/bin/sh
# Regenerates the Chrome Web Store screenshots and promo tiles in store/.
# Screenshots come from the real pages, rendered as plain files with a
# stubbed chrome API (screenshot-stub.js); two get a caption added using
# store/promo.html, which also draws the promo tiles. The store's API can't
# update listing images, so upload the results in the developer dashboard
# afterwards. Set CHROME if Chrome isn't in the usual place.
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

cp store/promo.html "$work/promo.html"

# render <output path> <width,height> <url>
render() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --window-size="$2" --virtual-time-budget="$TIME_BUDGET_MS" \
    --screenshot="$1" "$3" 2>/dev/null
}

# shot <name> <page> <date> <photo> <look json> [extra query]
shot() {
  look=$(printf %s "$5" | jq -sRr @uri)
  render "$PWD/store/$1.png" "$SIZE" "file://$work/$2?date=$3&photo=$4&look=$look${6:+&$6}"
  echo "store/$1.png"
}

# caption <name> <caption> <backdrop photo>: frames store/<name>.png, just
# rendered, on a blurred photo with a one-line caption above it
caption() {
  cp "store/$1.png" "$work/raw-$1.png"
  text=$(printf %s "$2" | jq -sRr @uri)
  render "$PWD/store/$1.png" "$SIZE" "file://$work/promo.html?tile=caption&shot=raw-$1.png&caption=$text&backdrop=$3"
  echo "store/$1.png (captioned)"
}

# One season per shot, each in a different preset to show the range, on a
# photo that says the season at a glance: red forest path, snowy firs,
# blossoms against blue sky, beach umbrellas. The settings shot uses a
# different winter photo (a frosted tree) so no photo appears twice.
shot screenshot-new-tab-autumn new-tab.html 2026-10-14 9 \
  '{"layout":"corners","attached":true,"density":"comfortable","style":"auto","blur":12,"corners":1.75}'
shot screenshot-new-tab-winter new-tab.html 2026-01-14 21 \
  '{"layout":"corners","attached":false,"density":"spacious","style":"light","blur":24,"corners":1.75}'
shot screenshot-new-tab-spring new-tab.html 2026-04-14 30 \
  '{"layout":"corners","attached":true,"density":"compact","style":"dark","blur":24,"corners":0}'
shot screenshot-new-tab-summer new-tab.html 2026-07-14 40 \
  '{"layout":"center","attached":true,"density":"spacious","style":"auto","blur":18,"corners":1.75}'
shot screenshot-options options.html 2026-01-14 62 \
  '{"layout":"corners","style":"auto","blur":12,"corners":1.75}' tab=look

# The two taglines, on the lead shots
caption screenshot-new-tab-summer "Open a tab. Step outside." images/winter/img_21.jpg
caption screenshot-new-tab-autumn "The seasons, one tab at a time." images/spring/img_30.jpg

render "$PWD/store/promo-marquee-1400x560.png" 1400,560 "file://$work/promo.html?tile=marquee"
echo "store/promo-marquee-1400x560.png"
render "$PWD/store/promo-small-440x280.png" 440,280 "file://$work/promo.html?tile=small"
echo "store/promo-small-440x280.png"
