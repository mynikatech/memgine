#!/usr/bin/env bash
set -u

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo "Memgine DEV HTTPS status"
echo "------------------------"

"$script_dir/status-frontend.sh" || true
"$script_dir/status-backend.sh" || true
"$script_dir/status-nginx.sh" || true

echo
echo "Frontend URL : https://memgine-dev.mynikatech.in"
echo "API URL      : https://api-memgine-dev.mynikatech.in"
echo