#!/usr/bin/env bash
set -euo pipefail

frontend_path="$1"
env_file="$2"
output_path="$3"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$script_dir/../../env/linux/load-environment.sh"

[[ -d "$frontend_path" ]] || { echo "Frontend path not found: $frontend_path" >&2; exit 1; }
load_memgine_environment_file "$env_file"
[[ -n "${EXPO_PUBLIC_API_BASE_URL:-}" ]] || { echo "EXPO_PUBLIC_API_BASE_URL is required in $env_file." >&2; exit 1; }
mkdir -p "$output_path"
cd "$frontend_path"
npm ci
npx expo export --platform web --output-dir "$output_path"