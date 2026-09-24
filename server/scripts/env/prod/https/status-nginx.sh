#!/usr/bin/env bash
set -u

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../../.." && pwd)"

"$repo_root/server/scripts/common/https/linux/status-nginx.sh" \
    "nginx"