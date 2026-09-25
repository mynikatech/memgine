#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"
scripts_root="${MEMGINE_SCRIPTS_ROOT:-$repo_root/server/scripts}"
. "$scripts_root/common/env/linux/load-environment.sh"

env_file="$environment_dir/memgine.env"
[[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
load_memgine_environment_file "$env_file"

for base_url in "$MEMGINE_WEB_BASE_URL" "$MEMGINE_API_BASE_URL"; do
  host="${base_url#*://}"
  host="${host%%/*}"
  cert="/etc/letsencrypt/live/$host/cert.pem"
  [[ -f "$cert" ]] || { echo "Certificate not found for $host: $cert" >&2; exit 1; }
  openssl x509 -in "$cert" -noout -subject -ext subjectAltName -enddate
done
