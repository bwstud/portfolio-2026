#!/bin/zsh
# The Groom Lake hero film as the site plays it: a recording of the prototype's sign-in, up to the press on Single
# Sign On, then a hard cut into the composed film (compose.html) where its own sign-in scene ends, at 2.6 s.
#   ./assemble.sh <sign-in recording.mp4> <film master.mp4>
# The recording: node record-signin.mjs <recording.mp4> (1600 x 1000, 60 fps, framed on the card)
# The master, a high-quality render of compose.html: node render.mjs <master.mp4> 60 1 10
# Writes images/groom-lake-hero.mp4 and its poster (the frame at 6 s).
set -e
clip=$1 master=$2
CLIP_END=2.4     # record-signin.mjs presses the button at 2.3 s
FILM_FROM=2.6    # the composed film's sign-in runs to here
root=${0:A:h:h:h}
tmp=$(mktemp -d)
# both are brought to 1600 x 1000 at 60 fps (the recording already is)
ffmpeg -y -loglevel error -i "$clip" -i "$master" -filter_complex "
  [0:v]trim=0:$CLIP_END,setpts=PTS-STARTPTS,fps=60,scale=1600:1000:flags=lanczos,setsar=1[a];
  [1:v]trim=start=$FILM_FROM,setpts=PTS-STARTPTS,fps=60,scale=1600:1000:flags=lanczos,setsar=1[b];
  [a][b]concat=n=2:v=1[v]" -map "[v]" \
  -c:v libx264 -preset veryslow -crf 23 -tune animation -pix_fmt yuv420p -movflags +faststart -an "$root/images/groom-lake-hero.mp4"
ffmpeg -y -loglevel error -ss 6 -i "$root/images/groom-lake-hero.mp4" -frames:v 1 "$tmp/poster.png"
python3 -c "from PIL import Image; Image.open('$tmp/poster.png').convert('RGB').save('$root/images/groom-lake-hero-poster.webp', quality=80, method=6)"
rm -rf "$tmp"
ffprobe -v error -show_entries format=duration,size -of csv=p=0 "$root/images/groom-lake-hero.mp4"
