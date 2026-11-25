#!/usr/bin/env bash
# Runs a command and, if it fails, publishes the end of its output as an
# error annotation, which (unlike the job log) anyone can read through the
# GitHub API without signing in.
# Usage: run-logged.sh <title> <command> [args...]
title="$1"
shift
log="$(mktemp)"
set -o pipefail
"$@" 2>&1 | tee "$log"
status=$?
if [ "$status" -ne 0 ]; then
  tail_text="$(tail -n 60 "$log" | sed -e 's/\x1b\[[0-9;]*m//g' -e 's/%/%25/g' -e 's/\r//g' | awk 'BEGIN{ORS="%0A"} {print}')"
  echo "::error title=${title}::${tail_text}"
fi
rm -f "$log"
exit "$status"
