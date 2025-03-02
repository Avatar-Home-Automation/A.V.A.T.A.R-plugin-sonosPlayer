#!/bin/bash
if [ $4 ==  mbrola ]
then
  # $1 -t = time ratio (speed in the properties e.g. 38)
  # $2 -v = voice
  # $3 = output wav file
  # $5 = voice file (e.g. '/usr/share/mbrola/fr4/fr4')
  # $6 --pho = tts
  espeak -v $2 -q --pho "$6" | mbrola -t $1 -e -C "n n2" $5 - "$3"
else
  # $1 -t = time ratio (speed in the properties e.g. 52)
  # $2 -v = voice
  # $3 = output wav file
  # $5 = tts
  espeak -v $2 -s $1 -w "$3" "$5" 
fi
