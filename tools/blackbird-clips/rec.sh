#!/bin/zsh
# ./rec.sh <name> <light|dark> "<setup steps>" "<clip steps>"
# Sets the appearance, runs the setup unrecorded, records the screen while the clip steps run, and trims the
# recording to the clip's marks. mark:start / mark:end go around the clip steps unless the steps place their own
# (to begin after something that shouldn't be seen, like the demo menu closing). A mark:flip in the steps switches
# the simulator to the other appearance at that moment. Writes masters/<name>.mp4 at 60fps.
set -e
D=${0:A:h}; name=$1; theme=$2; steps=$4
[[ $steps == *mark:start* ]] || steps="mark:start;$steps"
[[ $steps == *mark:end* ]] || steps="$steps;mark:end"
xcrun simctl ui booted appearance $theme
xcrun simctl status_bar booted override --time 9:41 --batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi
NODUMP=1 $D/run.sh "relaunch;wait:2.5;tap:Skip;wait:1.5;$3" >/dev/null
rm -f $D/raw/$name.mp4 $D/raw/$name.log $D/raw/$name.out
xcrun simctl io booted recordVideo --codec=h264 --force $D/raw/$name.mp4 2> $D/raw/$name.log &
rp=$!
until grep -q "Recording started" $D/raw/$name.log 2>/dev/null; do sleep 0.05; done
t0=$(python3 -c 'import time; print(time.time())')
marks=$D/raw/$name.marks; rm -rf $marks; mkdir -p $marks
MARKS=$marks NODUMP=1 $D/run.sh "$steps" > $D/raw/$name.out &
tp=$!
other=$([[ $theme == dark ]] && echo light || echo dark); flipped=0
while kill -0 $tp 2>/dev/null; do
  if (( !flipped )) && [[ -f $marks/flip ]]; then xcrun simctl ui booted appearance $other; flipped=1; fi
  sleep 0.03
done
kill -INT $rp; wait $rp 2>/dev/null || true
out=$(cat $D/raw/$name.out)
s=$(print -r -- "$out" | awk '/MARK start/ {print $3}'); e=$(print -r -- "$out" | awk '/MARK end/ {print $3}')
[[ -z "$s" || -z "$e" ]] && { print -r -- "$out"; echo "no marks"; exit 1; }
from=$(python3 -c "print(max(0, $s - $t0 - ${PRE:-0.3}))"); len=$(python3 -c "print($e - $s + ${PRE:-0.3})")
ffmpeg -y -loglevel error -ss $from -t $len -i $D/raw/$name.mp4 -vf "fps=60" -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -an $D/masters/$name.mp4
print -r -- "$out" | grep -E "MISSING|error" || true
printf '%s  %.1fs\n' $name $len
