#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
release_id="$2"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$script_dir/deploy.sh" "$environment_dir" "$release_id"
