#!/usr/bin/env bash
set -u

web_root="$1"

if [[ -f "$web_root/index.html" ]]; then
    echo "Frontend : DEPLOYED  $web_root/index.html"
    exit 0
fi

echo "Frontend : NOT DEPLOYED  expected $web_root/index.html"
exit 1