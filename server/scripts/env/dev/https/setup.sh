#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../../.." && pwd)"
: "${MEMGINE_APP_USER:=memgine}"
[[ -f "$script_dir/memgine.env" ]] || { echo "Missing runtime environment file: $script_dir/memgine.env" >&2; exit 1; }
[[ -f "$script_dir/frontend.env" ]] || { echo "Missing runtime frontend environment file: $script_dir/frontend.env" >&2; exit 1; }
"$repo_root/server/scripts/common/https/linux/validate-nginx.sh" "${MEMGINE_NGINX_BIN:-nginx}" "$script_dir" "nginx.conf"
"$repo_root/server/scripts/common/backend/linux/install-backend-service.sh" "memgine-dev" "$MEMGINE_APP_USER" "$repo_root" "$script_dir/memgine.env" "$repo_root/server/build/libs/memgine-server.jar"
echo "Host setup completed. Build the frontend and then run start-all.sh."