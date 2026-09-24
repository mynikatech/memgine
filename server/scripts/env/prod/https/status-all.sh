#!/usr/bin/env bash
set -u

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo "Memgine PROD HTTPS status"
echo "-------------------------"

"$script_dir/status-frontend.sh" || true
"$script_dir/status-backend.sh" || true
"$script_dir/status-nginx.sh" || true

echo
echo "Frontend : production Memgine web endpoint"
echo "API      : production Memgine API endpoint"
echo