#!/bin/zsh
# Encodes the Blackbird clip masters (rec.sh writes them, 1206 × 2622 at 60fps) for the Work page's reel:
#   images/blackbird-screens/clips/<name>.mp4      H.264, plays everywhere
#   images/blackbird-screens/clips/<name>.av1.mp4  AV1, about half the size, used where it decodes in hardware
#   images/blackbird-screens/clips/<name>.webp     the first frame, shown until the clip plays
# 360 × 782 is the phone's screen at the largest size the reel draws it, at 2x. The wall clips run at 24fps; these run at 60, since a phone screen scrolls and slides and judders at less.
#   ./encode.sh <masters dir> [name ...]
set -e
src=${1:?masters dir}; shift
out=${0:A:h:h:h}/images/blackbird-screens/clips
names=(${@:-${(f)"$(cd $src && ls *.mp4 | sed 's/\.mp4$//')"}})
vf="scale=360:782:flags=lanczos,fps=60"
for n in $names; do
  ffmpeg -v error -y -i $src/$n.mp4 -vf $vf -an -c:v libx264 -profile:v high -crf 30 -preset veryslow -tune animation -pix_fmt yuv420p -movflags +faststart $out/$n.mp4
  ffmpeg -v error -y -i $src/$n.mp4 -vf $vf -an -c:v libsvtav1 -crf 60 -preset 4 -svtav1-params tune=0:enable-overlays=1 -pix_fmt yuv420p -movflags +faststart $out/$n.av1.mp4
  ffmpeg -v error -y -i $out/$n.mp4 -frames:v 1 $out/$n.png
  python3 -c "from PIL import Image; Image.open('$out/$n.png').save('$out/$n.webp', quality=82)"; rm $out/$n.png
  printf '%-22s h264 %4d KB  av1 %4d KB\n' $n $(( $(stat -f %z $out/$n.mp4) / 1024 )) $(( $(stat -f %z $out/$n.av1.mp4) / 1024 ))
done
