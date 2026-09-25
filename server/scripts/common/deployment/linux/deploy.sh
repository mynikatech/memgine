#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
release_id="$2"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$script_dir/../../env/linux/load-environment.sh"

deployment_file="$environment_dir/deployment.properties"
[[ -f "$deployment_file" ]] || { echo "Deployment properties not found: $deployment_file" >&2; exit 1; }
load_memgine_environment_file "$deployment_file"

: "${MEMGINE_DEPLOY_BUCKET:?MEMGINE_DEPLOY_BUCKET is required}"
: "${MEMGINE_ENVIRONMENT:?MEMGINE_ENVIRONMENT is required}"
: "${MEMGINE_DB_SECRET_ARN:?MEMGINE_DB_SECRET_ARN is required}"

app_root="${MEMGINE_APP_ROOT:-/opt/memgine}"
release_root="$app_root/releases/$release_id"
web_root="${MEMGINE_WEB_ROOT:-/var/www/memgine-${MEMGINE_ENVIRONMENT}}"
release_prefix="releases/$release_id"

install -d -o "${MEMGINE_APP_USER:-memgine}" -g "${MEMGINE_APP_USER:-memgine}" -m 0750 "$release_root"
aws s3 cp "s3://${MEMGINE_DEPLOY_BUCKET}/${release_prefix}/server/server.jar" "$release_root/server.jar"
aws s3 sync --delete "s3://${MEMGINE_DEPLOY_BUCKET}/${release_prefix}/frontend/" "$web_root/"
ln -sfn "$release_root/server.jar" "$app_root/server/server.jar"

aws s3 cp "s3://${MEMGINE_DEPLOY_BUCKET}/config/backend.env.template" "$app_root/config/backend.env.template"
[[ -f "$app_root/config/backend.env" ]] || cp "$app_root/config/backend.env.template" "$app_root/config/backend.env"
"$script_dir/render-rds-secret.sh" "$MEMGINE_DB_SECRET_ARN" "$app_root/config/backend-secrets.env"

"$script_dir/../../backend/linux/install-backend-service.sh" \
  "memgine-${MEMGINE_ENVIRONMENT}" \
  "${MEMGINE_APP_USER:-memgine}" \
  "$app_root" \
  "$app_root/config/backend.env" \
  "$app_root/server/server.jar" \
  "$app_root/config/backend-secrets.env"

systemctl restart "memgine-${MEMGINE_ENVIRONMENT}"
"$script_dir/configure-nginx.sh" "$environment_dir" https
"$script_dir/health-check.sh" "$environment_dir"
