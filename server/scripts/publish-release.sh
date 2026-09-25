#!/usr/bin/env bash
set -euo pipefail

environment="$1"
release_id="$2"
script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_root/../.." && pwd)"
environment_dir="$script_root/env/$environment/https"
. "$script_root/common/env/linux/load-environment.sh"

[[ -d "$environment_dir" ]] || { echo "Unsupported environment: $environment" >&2; exit 64; }
deployment_file="$environment_dir/deployment.properties"
frontend_env="$environment_dir/frontend.env"
[[ -f "$deployment_file" ]] || { echo "Deployment properties not found: $deployment_file" >&2; exit 1; }
[[ -f "$frontend_env" ]] || { echo "Frontend environment file not found: $frontend_env" >&2; exit 1; }
load_memgine_environment_file "$deployment_file"
: "${MEMGINE_DEPLOY_BUCKET:?MEMGINE_DEPLOY_BUCKET is required}"

server_jar="${MEMGINE_SERVER_JAR:-$repo_root/server/build/libs/memgine-server.jar}"
[[ -f "$server_jar" ]] || { echo "Server JAR not found: $server_jar" >&2; exit 1; }

staging_dir="$(mktemp -d)"
trap 'rm -rf "$staging_dir"' EXIT
frontend_output="$staging_dir/frontend"

"$script_root/common/frontend/linux/build-frontend.sh" "$repo_root/frontend" "$frontend_env" "$frontend_output"

release_prefix="releases/$release_id"
aws s3 cp "$server_jar" "s3://${MEMGINE_DEPLOY_BUCKET}/${release_prefix}/server/server.jar"
aws s3 sync --delete "$frontend_output/" "s3://${MEMGINE_DEPLOY_BUCKET}/${release_prefix}/frontend/"
aws s3 sync --delete "$script_root/" "s3://${MEMGINE_DEPLOY_BUCKET}/scripts/" \
  --exclude 'env/local/*' \
  --exclude 'env/*/https/memgine.env' \
  --exclude 'env/*/https/frontend.env' \
  --exclude 'env/*/https/deployment.properties' \
  --exclude 'env/*/https/backend-secrets.env' \
  --exclude 'env/*/https/certs/*' \
  --exclude 'env/*/https/logs/*' \
  --exclude 'env/*/https/runtime/*' \
  --exclude '*.key' \
  --exclude '*.pem'
aws s3 cp "$frontend_env" "s3://${MEMGINE_DEPLOY_BUCKET}/config/frontend.env"
aws s3 cp "$environment_dir/memgine.env.example" "s3://${MEMGINE_DEPLOY_BUCKET}/config/backend.env.template"

sha256sum "$server_jar" > "$staging_dir/server.sha256"
cat > "$staging_dir/release-manifest.json" <<EOF
{"releaseId":"$release_id","environment":"$environment","serverJarSha256":"$(cut -d ' ' -f 1 "$staging_dir/server.sha256")"}
EOF
aws s3 cp "$staging_dir/release-manifest.json" "s3://${MEMGINE_DEPLOY_BUCKET}/${release_prefix}/release-manifest.json"

echo "Published release $release_id to s3://${MEMGINE_DEPLOY_BUCKET}/${release_prefix}/"
