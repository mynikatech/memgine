#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
mode="${2:-https}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../../.." && pwd)"
scripts_root="${MEMGINE_SCRIPTS_ROOT:-$repo_root/server/scripts}"

"$script_dir/render-nginx.sh" "$environment_dir" "$mode"
"$scripts_root/common/https/linux/validate-nginx.sh" "${MEMGINE_NGINX_BIN:-nginx}" "$environment_dir" "nginx.conf"
"$scripts_root/common/https/linux/reload-nginx.sh" "${MEMGINE_NGINX_BIN:-nginx}" "$environment_dir" "nginx.conf"
