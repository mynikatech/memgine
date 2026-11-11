#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$script_dir/../../env/linux/load-environment.sh"

env_file="$environment_dir/memgine.env"
[[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
load_memgine_environment_file "$env_file"

systemctl is-active --quiet "memgine-${MEMGINE_ENVIRONMENT}"
: "${MEMGINE_SERVER_PORT:?MEMGINE_SERVER_PORT is required}"
curl --fail --silent --show-error "http://127.0.0.1:${MEMGINE_SERVER_PORT}/health" >/dev/null
curl --fail --silent --show-error "${MEMGINE_API_BASE_URL}/health" >/dev/null
curl --fail --silent --show-error "${MEMGINE_WEB_BASE_URL}" >/dev/null
echo "Memgine ${MEMGINE_ENVIRONMENT} health checks passed."
