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
aws s3 cp "s3://$(grep '^MEMGINE_DEPLOY_BUCKET=' "$environment_dir/deployment.properties.example" | cut -d= -f2)/config/deployment.properties" "$environment_dir/deployment.properties"
[[ -f "$environment_dir/memgine.env" ]] || cp "$environment_dir/memgine.env.example" "$environment_dir/memgine.env"
export MEMGINE_SCRIPTS_ROOT="$scripts_root"
exec "$scripts_root/common/deployment/linux/deploy.sh" "$environment_dir" "$release_id"
