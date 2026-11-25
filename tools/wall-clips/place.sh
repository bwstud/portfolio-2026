#!/bin/sh
# Copy recorded clips onto wall tiles: place.sh <clips dir> <wall dir> <tiles file>
# The tiles file has one "NN name" per line: tile NN gets clips/<name>.mp4, its AV1 twin and its poster.
# Spread the tiles over the wall's columns: tile n sits in column (n - 1) % 6.
set -e
SRC="$1"; WALL="$2"; LIST="$3"
mkdir -p "$WALL/clips"
while read -r n name; do
  [ -z "$n" ] && continue
  cp "$SRC/$name.mp4" "$WALL/clips/$n.mp4"
  cp "$SRC/$name.av1.mp4" "$WALL/clips/$n.av1.mp4"
  cp "$SRC/$name.webp" "$WALL/clips/$n.webp"
done < "$LIST"
echo "data-clips=\"$(awk '{printf "%s%d", (NR>1?" ":""), $1}' "$LIST")\""
