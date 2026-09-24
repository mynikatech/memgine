#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../../.." && pwd)"
"$repo_root/server/scripts/common/frontend/linux/build-frontend.sh" "$repo_root/frontend" "$script_dir/frontend.env" "/var/www/memgine"