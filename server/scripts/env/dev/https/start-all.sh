#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "/var/www/memgine-dev/index.html" ]] || { echo "Frontend is not built at /var/www/memgine-dev. Run build-frontend.sh first." >&2; exit 1; }
"$script_dir/start-backend.sh"
if systemctl is-active --quiet nginx; then
  echo "Nginx is already running; leaving it in place."
else
  "$script_dir/start-nginx.sh"
fi