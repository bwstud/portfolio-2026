#!/bin/zsh
# ./strip.sh <mp4> <out.png> [n]  — n frames across the clip, side by side
f=$1; n=${3:-8}; d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $f)
ffmpeg -y -loglevel error -i $f -vf "fps=$n/$d,scale=200:-1,tile=${n}x1" -frames:v 1 $2
echo "$d s"
