#!/bin/bash
f=$1; n=$(basename $f .c); d=/tmp/s3/probe/host; mkdir -p $d
if ! timeout 60 gcc -m32 -std=gnu11 -O0 -fsigned-char -w $f -o $d/$n.bin -lm >/dev/null 2>&1; then echo -e "$n\tHOST_COMPILE_FAIL"; exit; fi
timeout 10 $d/$n.bin >/dev/null 2>&1; rc=$?
if [ $rc -eq 0 ]; then echo -e "$n\tHOST_PASS"; elif [ $rc -eq 134 ]; then echo -e "$n\tHOST_ABORT"; else echo -e "$n\tHOST_RC$rc"; fi
