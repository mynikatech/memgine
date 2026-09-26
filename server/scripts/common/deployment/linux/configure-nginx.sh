#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
mode="${2:-https}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../../.." && pwd)"
scripts_root="${MEMGINE_SCRIPTS_ROOT:-$repo_root/server/scripts}"

"$script_dir/render-nginx.sh" "$environment_dir" "$mode"

. "$scripts_root/common/env/linux/load-environment.sh"
load_memgine_environment_file "$environment_dir/memgine.env"

nginx_binary="${MEMGINE_NGINX_BIN:-nginx}"
if [[ "$nginx_binary" != /* ]]; then
  nginx_binary="$(command -v "$nginx_binary" || true)"
fi
[[ -n "$nginx_binary" && -x "$nginx_binary" ]] || { echo "Nginx executable was not found." >&2; exit 1; }

target="/etc/nginx/conf.d/memgine-${MEMGINE_ENVIRONMENT}.conf"
install -D -m 0644 "$environment_dir/conf.d/memgine.conf" "$target"
"$nginx_binary" -t
systemctl enable nginx
if systemctl is-active --quiet nginx; then
  systemctl reload nginx
else
  systemctl start nginx
fi
