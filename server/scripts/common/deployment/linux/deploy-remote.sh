#!/usr/bin/env bash
set -euo pipefail

environment="$1"
release_id="$2"
app_root="/opt/memgine"
scripts_root="$app_root/scripts"
environment_dir="$scripts_root/env/$environment/https"

[[ "$environment" == "dev" || "$environment" == "prod" ]] || { echo "Unsupported environment: $environment" >&2; exit 64; }
[[ -x "/usr/local/bin/memgine-sync-scripts" ]] || { echo "EC2 bootstrap sync utility is missing." >&2; exit 1; }

/usr/local/bin/memgine-sync-scripts
deploy_bucket="$(
  grep '^MEMGINE_DEPLOY_BUCKET=' \
    "$environment_dir/deployment.properties.example" |
    cut -d= -f2
)"

[[ -n "$deploy_bucket" ]] || {
  echo "Deployment bucket is missing." >&2
  exit 1
}

aws s3 cp \
  "s3://${deploy_bucket}/config/deployment.properties" \
  "$environment_dir/deployment.properties"

config_tmp="$(mktemp "$environment_dir/memgine.env.XXXXXX")"

trap 'rm -f "$config_tmp"' EXIT

aws s3 cp \
  "s3://${deploy_bucket}/releases/${release_id}/config/memgine.env" \
  "$config_tmp"

chmod 0600 "$config_tmp"

mv -f "$config_tmp" "$environment_dir/memgine.env"

trap - EXIT
export MEMGINE_SCRIPTS_ROOT="$scripts_root"
exec "$scripts_root/common/deployment/linux/deploy.sh" "$environment_dir" "$release_id"
