#!/usr/bin/env bash
set -euo pipefail

environment="$1"
release_id="$2"
script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
environment_dir="$script_root/env/$environment/https"

[[ -d "$environment_dir" ]] || { echo "Unsupported environment: $environment" >&2; exit 64; }
export MEMGINE_SCRIPTS_ROOT="$script_root"
exec "$script_root/common/deployment/linux/deploy.sh" "$environment_dir" "$release_id"
