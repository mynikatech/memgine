#!/usr/bin/env bash
set -euo pipefail

nginx_binary="$1"
prefix="$2"
config_path="$3"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$script_dir/validate-nginx.sh" "$nginx_binary" "$prefix" "$config_path"
"$nginx_binary" -p "$prefix" -c "$config_path"