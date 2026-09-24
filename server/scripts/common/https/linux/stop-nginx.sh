#!/usr/bin/env bash
set -euo pipefail

nginx_binary="$1"
prefix="$2"
config_path="$3"

"$nginx_binary" -p "$prefix" -c "$config_path" -s quit