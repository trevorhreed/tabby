#!/bin/sh
# Writes tints.json, each wallpaper's average color, so the new tab can tint
# its panels without decoding the photo first. Runs in the publish workflow;
# set CHROME to the Chrome binary when it isn't on PATH as google-chrome.
set -eu
cd "$(dirname "$0")/.."

CHROME="${CHROME:-google-chrome}"
OUT="tints.json"
# Generous: headless Chrome's virtual clock only advances while it's idle,
# so this bounds the wait for all photos to load and decode
TIME_BUDGET_MS=300000

images=$(find images -name '*.jpg' | sort)
list=$(echo "$images" | paste -sd, -)
expected=$(echo "$images" | wc -l | tr -d ' ')

# file:// pages can't read image pixels without --allow-file-access-from-files.
# --no-sandbox because Ubuntu 24.04 runners block the user namespaces Chrome's
# sandbox needs; the page only loads files from this repo.
"$CHROME" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files \
  --virtual-time-budget="$TIME_BUDGET_MS" \
  --dump-dom "file://$PWD/scripts/tints.html#$list" 2>/dev/null |
  sed -n 's:.*<pre id="tints">\(.*\)</pre>.*:\1:p' > "$OUT"

actual=$(grep -o '"images/' "$OUT" | wc -l | tr -d ' ')
if [ "$actual" != "$expected" ]; then
  echo "tints.json has $actual of $expected images" >&2
  exit 1
fi
echo "Wrote $OUT for $actual images"
