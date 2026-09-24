#!/usr/bin/env bash
set -euo pipefail

nginx_binary="$1"
prefix="$2"
config_path="$3"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$script_dir/validate-nginx.sh" \
    "$nginx_binary" \
    "$prefix" \
    "$config_path"

if systemctl is-active --quiet nginx; then
    echo "Nginx is already running."
    exit 0
fi

systemctl start nginx

if ! systemctl is-active --quiet nginx; then
    echo "Nginx failed to start." >&2
    exit 1
fi

echo "Nginx started."