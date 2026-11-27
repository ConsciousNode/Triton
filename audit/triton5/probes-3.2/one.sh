#!/bin/bash
# usage: one.sh test.c  -> prints "name<TAB>status<TAB>detail"
f=$1; n=$(basename $f .c); W=/tmp/s32/probe/work/$n; mkdir -p $W
sed -E 's/\bmain[[:space:]]*\(/__t_main(/' $f > $W/t.c
cd /tmp/s32/run
out=$(timeout 60 node tcc5/tcc5.js -I /tmp/s3/probe/inc /tmp/s32/probe/libmini.c $W/t.c --run 2>$W/err)
rc=$?
echo "$out" > $W/out
if [ $rc -eq 124 ]; then st=TIMEOUT
elif [ $rc -ne 0 ]; then st=COMPILE_OR_RUN_ERROR
elif echo "$out" | grep -q '@@ABORT'; then st=ABORT
elif echo "$out" | grep -q '@@EXIT 0'; then st=PASS
elif echo "$out" | grep -q '@@EXIT'; then st=EXIT_NONZERO
elif echo "$out" | grep -q '@@RET 0'; then st=PASS
elif echo "$out" | grep -q '@@RET'; then st=RET_NONZERO
else st=NO_RESULT; fi
printf "%s\t%s\t%s\n" "$n" "$st" "$(head -c 160 $W/err | tr '\n\t' '  ')"
