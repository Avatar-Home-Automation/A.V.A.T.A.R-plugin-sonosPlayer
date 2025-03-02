#!/bin/bash

# Parameters in order:
#  Speed:
#   '-r',
#   '180',
#  Voice:
#   'Eddy (Anglais (R.-U.))',
#  file:
#   '-o',
#   '/users/avatar/...'
#  tts:
#   "hello there !"

exportFile="${5:0:${#5}-4}"
# Add ".aiff"
exportAiff="${exportFile}.aiff"
# Add ".mp3"
exportMp="${exportFile}.mp3"

# Check between default and defined voice
if [ "$3" == default ]
then
   say -r "$2" -o "$exportAiff" "$6"
else
   say -v "$3" -r "$2" -o "$exportAiff" "$6"
fi

ffmpeg -i "$exportAiff" -vn -ar 44100 -ac 2 -b:a 128k -y "$exportMp"
