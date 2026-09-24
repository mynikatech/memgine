#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../../.." && pwd)"
"$repo_root/server/scripts/common/https/linux/start-nginx.sh" "${MEMGINE_NGINX_BIN:-nginx}" "$script_dir" "nginx.conf"