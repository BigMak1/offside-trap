#!/bin/sh
# Build the itch.io HTML5 bundle from the repo: a clean staging dir + a zip with
# index.html at the archive ROOT (required by itch). Ships only the game — mirrors
# .vercelignore, so no tooling/tests/source media. No secrets here.
#
#   ./build-itch.sh            -> dist/itch-build/ (folder for `butler push`)
#                                 dist/offside-trap-itch.zip (for manual web upload)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/dist/itch-build"
ZIP="$ROOT/dist/offside-trap-itch.zip"

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"
cp "$ROOT/index.html" "$ROOT/styles.css" "$OUT/"
cp -R "$ROOT/js" "$OUT/"
# assets, excluding the generator tooling in assets/_build
( cd "$ROOT/assets" && tar --exclude=_build -cf - . ) | ( mkdir -p "$OUT/assets" && cd "$OUT/assets" && tar -xf - )
# zip from inside the staging dir so index.html sits at the archive root
( cd "$OUT" && zip -rq "$ZIP" . -x '.*' )

echo "built:"
echo "  dir: $OUT  ($(find "$OUT" -type f | wc -l | tr -d ' ') files)"
echo "  zip: $ZIP  ($(du -h "$ZIP" | cut -f1))"
