#!/bin/zsh
# Cuts the hero film's AI shots out of the masters record-ai.mjs writes, into src/ai/<shot>.mp4: a window of the
# recording (in page px, 1600 × 1000; the masters are 2x), from one time to another, retimed to the length the shot
# has in compose.html. Small, sharp and quick to seek (a keyframe every 6 frames), so the film can step through them.
#   ./cut-ai.sh <masters dir>
set -e
rec=${1:?masters dir}
here=${0:A:h}
mkdir -p "$here/src/ai"
# shot              master  from   to     length  x     y    w     h
shots=(
  "filter-type      filter  0.40   2.55   1.20    1090  760  500   220"
  "filter-card      filter  3.12   4.32   1.30    1090  90   500   480"
  "filter-expr      filter  4.45   5.80   1.20    320   175  960   470"
  "filter-results   filter  5.95   7.25   1.10    60    100  1360  660"
  "intake-voice     intake  1.30   3.25   1.50    520   230  840   470"
  "intake-think     intake  4.40   5.50   1.00    520   60   900   380"
  "intake-record    intake  5.55   8.60   2.30    0     0    1600  1000"
  "build-ask        build   1.40   3.85   1.40    1090  740  500   250"
  "build-plan       build   4.00   6.25   1.50    1090  110  500   550"
  "build-preview    build   6.30   8.25   1.30    1090  30   500   960"
  "build-landed     build   8.45   11.20  2.40    72    40   1528  960"
)
for s in $shots; do
  read name master from to len x y w h <<< "$s"
  span=$(( to - from ))
  ffmpeg -y -loglevel error -ss $from -t $span -i "$rec/$master.mp4" \
    -vf "crop=$((w*2)):$((h*2)):$((x*2)):$((y*2)),setpts=(PTS-STARTPTS)*$len/$span,fps=60" \
    -c:v libx264 -preset slow -crf 16 -g 6 -pix_fmt yuv420p -an -movflags +faststart "$here/src/ai/$name.mp4"
  printf '%-16s %5.2fs  %4d KB\n' $name $len $(( $(stat -f %z "$here/src/ai/$name.mp4") / 1024 ))
done
