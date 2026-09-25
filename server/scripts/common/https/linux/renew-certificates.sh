#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"
scripts_root="${MEMGINE_SCRIPTS_ROOT:-$repo_root/server/scripts}"

certbot renew --deploy-hook "$scripts_root/common/deployment/linux/configure-nginx.sh $environment_dir https"
