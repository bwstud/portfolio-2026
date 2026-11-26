#!/bin/zsh
# ./recall.sh <theme> [name ...] — records the clips in clips.txt (all, or those named) in one theme.
# clips.txt: name|setup steps|clip steps[|steps to run afterwards, to put the app back]
D=${0:A:h}; theme=$1; shift
while IFS="|" read -r -u 3 name setup steps after; do
  [[ -z $name ]] && continue
  (( $# )) && [[ ${@[(ie)$name]} -gt $# ]] && continue
  $D/rec.sh $name-$theme $theme "$setup" "$steps" </dev/null 2>&1 | grep -vE "Recording completed|Wrote video|^$"
  [[ -n $after ]] && NODUMP=1 $D/run.sh "$after" </dev/null >/dev/null
  $D/strip.sh $D/masters/$name-$theme.mp4 $D/shots/strip-$name-$theme.png 10 >/dev/null
done 3< $D/clips.txt
