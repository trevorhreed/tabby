#!/bin/sh
# Renders the extension icons (icons/icon<size>.png) from the SVG sources:
# icon.svg for 48 and 128, icon-16.svg (drawn for small sizes) for 16.
# Set CHROME if Chrome isn't in the usual place.
set -eu
cd "$(dirname "$0")/.."

MAC_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -z "${CHROME:-}" ]; then
  if [ -x "$MAC_CHROME" ]; then CHROME="$MAC_CHROME"; else CHROME=google-chrome; fi
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# render <svg> <size>: the SVG drawn at exactly <size> px on a transparent
# background, so the tile's rounded corners stay see-through
render() {
  printf '<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:%spx;height:%spx}</style><img src="%s">' \
    "$2" "$2" "file://$PWD/icons/$1" > "$work/icon.html"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --default-background-color=00000000 --window-size="$2,$2" --virtual-time-budget=2000 \
    --screenshot="$PWD/icons/icon$2.png" "file://$work/icon.html" 2>/dev/null
  echo "icons/icon$2.png"
}

render icon-16.svg 16
render icon.svg 48
render icon.svg 128
