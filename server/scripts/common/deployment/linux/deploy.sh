#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
release_id="$2"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$script_dir/../../env/linux/load-environment.sh"

deployment_file="$environment_dir/deployment.properties"

[[ -f "$deployment_file" ]] || {
  echo "Deployment properties not found: $deployment_file" >&2
  exit 1
}

load_memgine_environment_file "$deployment_file"

: "${MEMGINE_DEPLOY_BUCKET:?MEMGINE_DEPLOY_BUCKET is required}"
: "${MEMGINE_ENVIRONMENT:?MEMGINE_ENVIRONMENT is required}"
: "${MEMGINE_DB_SECRET_ARN:?MEMGINE_DB_SECRET_ARN is required}"
: "${MEMGINE_DB_HOST:?MEMGINE_DB_HOST is required}"
: "${MEMGINE_DB_PORT:?MEMGINE_DB_PORT is required}"
: "${MEMGINE_OTP_PEPPER_SECRET_ARN:?MEMGINE_OTP_PEPPER_SECRET_ARN is required}"
: "${MEMGINE_ASSET_STORAGE_PROVIDER:?MEMGINE_ASSET_STORAGE_PROVIDER is required}"
: "${MEMGINE_APP_DATA_BUCKET:?MEMGINE_APP_DATA_BUCKET is required}"
: "${MEMGINE_AWS_REGION:?MEMGINE_AWS_REGION is required}"

if [[ -z "$MEMGINE_DB_HOST" ]]; then
  echo "MEMGINE_DB_HOST must not be empty." >&2
  exit 1
fi

if ! [[ "$MEMGINE_DB_PORT" =~ ^[0-9]+$ ]] ||
   (( MEMGINE_DB_PORT < 1 || MEMGINE_DB_PORT > 65535 )); then
  echo "MEMGINE_DB_PORT must be an integer between 1 and 65535." >&2
  exit 1
fi

app_user="${MEMGINE_APP_USER:-memgine}"
app_root="${MEMGINE_APP_ROOT:-/opt/memgine}"
web_root="${MEMGINE_WEB_ROOT:-/var/www/memgine-${MEMGINE_ENVIRONMENT}}"

release_root="$app_root/releases/$release_id"
release_prefix="releases/$release_id"

server_root="$app_root/server"
config_root="$app_root/config"

active_jar="$server_root/server.jar"
last_successful_file="$app_root/last-successful-release"

service_name="memgine-${MEMGINE_ENVIRONMENT}"

health_attempts="${MEMGINE_DEPLOY_HEALTH_ATTEMPTS:-15}"
health_delay_seconds="${MEMGINE_DEPLOY_HEALTH_DELAY_SECONDS:-2}"

if ! [[ "$health_attempts" =~ ^[0-9]+$ ]] || (( health_attempts < 1 )); then
  echo "MEMGINE_DEPLOY_HEALTH_ATTEMPTS must be a positive integer." >&2
  exit 1
fi

if ! [[ "$health_delay_seconds" =~ ^[0-9]+$ ]] || (( health_delay_seconds < 1 )); then
  echo "MEMGINE_DEPLOY_HEALTH_DELAY_SECONDS must be a positive integer." >&2
  exit 1
fi

install -d -o "$app_user" -g "$app_user" -m 0750 "$app_root"
install -d -o "$app_user" -g "$app_user" -m 0750 "$server_root"
install -d -o "$app_user" -g "$app_user" -m 0750 "$config_root"
install -d -o "$app_user" -g "$app_user" -m 0750 "$app_root/releases"

run_health_check_with_retry() {
  local attempts="${1:-$health_attempts}"
  local delay_seconds="${2:-$health_delay_seconds}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    echo "Health check attempt ${attempt}/${attempts}..."

    if "$script_dir/health-check.sh" "$environment_dir"; then
      echo "Health check passed."
      return 0
    fi

    if (( attempt < attempts )); then
      echo "Health check failed. Waiting ${delay_seconds}s before retry..."
      sleep "$delay_seconds"
    fi
  done

  echo "Health check failed after ${attempts} attempts." >&2
  return 1
}

get_active_release_id() {
  local resolved_jar=""

  if [[ ! -L "$active_jar" ]]; then
    return 0
  fi

  resolved_jar="$(readlink -f "$active_jar" 2>/dev/null || true)"

  if [[ -z "$resolved_jar" ]]; then
    return 0
  fi

  case "$resolved_jar" in
    "$app_root"/releases/*/server.jar)
      basename "$(dirname "$resolved_jar")"
      ;;
  esac
}

record_last_successful_release() {
  local successful_release_id="$1"
  local temp_file="${last_successful_file}.tmp"

  printf '%s\n' "$successful_release_id" > "$temp_file"
  chown "$app_user:$app_user" "$temp_file"
  chmod 0640 "$temp_file"
  mv -f "$temp_file" "$last_successful_file"

  echo "Recorded last successful release: $successful_release_id"
}

read_last_successful_release() {
  if [[ ! -f "$last_successful_file" ]]; then
    return 0
  fi

  tr -d '\r\n' < "$last_successful_file"
}

download_and_verify_server_release() {
  local target_release_id="$1"
  local target_release_root="$app_root/releases/$target_release_id"
  local target_release_prefix="releases/$target_release_id"
  local expected_sha256
  local actual_sha256

  echo "Preparing backend release: $target_release_id"

  install -d \
    -o "$app_user" \
    -g "$app_user" \
    -m 0750 \
    "$target_release_root"

  aws s3 cp \
    "s3://${MEMGINE_DEPLOY_BUCKET}/${target_release_prefix}/server/server.jar" \
    "$target_release_root/server.jar"

  aws s3 cp \
    "s3://${MEMGINE_DEPLOY_BUCKET}/${target_release_prefix}/release-manifest.json" \
    "$target_release_root/release-manifest.json"

  expected_sha256="$(
    jq -er '.serverJarSha256' \
      "$target_release_root/release-manifest.json"
  )"

  actual_sha256="$(
    sha256sum "$target_release_root/server.jar" |
      awk '{print $1}'
  )"

  if [[ "$actual_sha256" != "$expected_sha256" ]]; then
    echo "Release JAR checksum verification failed for release $target_release_id." >&2
    exit 1
  fi

  chown "$app_user:$app_user" "$target_release_root/server.jar"
  chown "$app_user:$app_user" "$target_release_root/release-manifest.json"

  echo "Backend release checksum verified: $target_release_id"
}

sync_release_frontend() {
  local target_release_id="$1"

  echo "Synchronizing frontend for release: $target_release_id"

  aws s3 sync \
    --delete \
    --exact-timestamps \
    "s3://${MEMGINE_DEPLOY_BUCKET}/releases/${target_release_id}/frontend/" \
    "$web_root/"
}

rollback_to_last_successful_release() {
  local rollback_release_id
  local rollback_release_root

  rollback_release_id="$(read_last_successful_release)"

  if [[ -z "$rollback_release_id" ]]; then
    echo "No last successful release is recorded. Automatic rollback is unavailable." >&2
    return 1
  fi

  if [[ "$rollback_release_id" == "$release_id" ]]; then
    echo "Last successful release is the same as the failed candidate release. Automatic rollback is unavailable." >&2
    return 1
  fi

  rollback_release_root="$app_root/releases/$rollback_release_id"

  echo ""
  echo "=============================================================="
  echo " Rolling back Memgine"
  echo "=============================================================="
  echo "Failed release        : $release_id"
  echo "Last successful       : $rollback_release_id"
  echo ""

  if [[ ! -f "$rollback_release_root/server.jar" ||
        ! -f "$rollback_release_root/release-manifest.json" ]]; then
    echo "Last successful release is not fully available locally. Downloading it again..."

    download_and_verify_server_release "$rollback_release_id"
  fi

  sync_release_frontend "$rollback_release_id"

  ln -sfn \
    "$rollback_release_root/server.jar" \
    "$active_jar"

  systemctl restart "$service_name"

  "$script_dir/configure-nginx.sh" "$environment_dir" https

  if run_health_check_with_retry; then
    echo ""
    echo "Rollback succeeded."
    echo "Active release: $rollback_release_id"
    return 0
  fi

  echo ""
  echo "CRITICAL: rollback release also failed health checks." >&2

  systemctl status "$service_name" --no-pager || true
  journalctl -u "$service_name" -n 150 --no-pager || true

  return 1
}

#
# Bootstrap last-successful-release.
#
# Older deployments did not maintain this marker. If there is currently an
# active release and it is healthy, treat it as the initial known-good release.
#
if [[ ! -s "$last_successful_file" ]]; then
  current_release_id="$(get_active_release_id)"

  if [[ -n "$current_release_id" ]] &&
     systemctl is-active --quiet "$service_name"; then

    echo "No last successful release is recorded."
    echo "Checking currently active release before bootstrapping marker: $current_release_id"

    if run_health_check_with_retry 3 2; then
      record_last_successful_release "$current_release_id"
    else
      echo "Current active release is not healthy. It will not be recorded as successful." >&2
    fi
  fi
fi

echo ""
echo "=============================================================="
echo " Deploying Memgine"
echo "=============================================================="
echo "Environment           : $MEMGINE_ENVIRONMENT"
echo "Candidate release     : $release_id"

last_successful_release_id="$(read_last_successful_release)"

if [[ -n "$last_successful_release_id" ]]; then
  echo "Last successful       : $last_successful_release_id"
else
  echo "Last successful       : none recorded"
fi

echo "=============================================================="
echo ""

#
# Download and verify candidate backend artifact.
#
download_and_verify_server_release "$release_id"

#
# Deploy candidate frontend.
#
sync_release_frontend "$release_id"

#
# Point backend service at candidate JAR.
#
ln -sfn \
  "$release_root/server.jar" \
  "$active_jar"

#
# Prepare non-secret backend environment template.
#
aws s3 cp \
  "s3://${MEMGINE_DEPLOY_BUCKET}/config/backend.env.template" \
  "$config_root/backend.env.template"

if [[ ! -f "$config_root/backend.env" ]]; then
  cp \
    "$config_root/backend.env.template" \
    "$config_root/backend.env"
fi

#
# Apply deployment-generated runtime values.
#
# The obsolete generic MEMGINE_OTP_AWS_ORIGINATION_IDENTITY value is always
# removed. Canada uses MEMGINE_OTP_AWS_ORIGINATION_IDENTITY_CA.
#
for runtime_key in \
  MEMGINE_NOTIFICATION_EVENTS_TOPIC_ARN \
  MEMGINE_ALLOW_LIVE_SMS \
  MEMGINE_OTP_AWS_ORIGINATION_IDENTITY \
  MEMGINE_OTP_AWS_ORIGINATION_IDENTITY_CA \
  MEMGINE_ASSET_STORAGE_PROVIDER \
  MEMGINE_APP_DATA_BUCKET \
  MEMGINE_AWS_REGION
do
  runtime_value="${!runtime_key:-}"

  sed -i \
    "/^${runtime_key}=/d" \
    "$config_root/backend.env"

  if [[ "$runtime_key" != "MEMGINE_OTP_AWS_ORIGINATION_IDENTITY" &&
        -n "$runtime_value" ]]; then

    printf '%s=%s\n' \
      "$runtime_key" \
      "$runtime_value" \
      >> "$config_root/backend.env"
  fi
done

#
# Render DB credentials and OTP pepper from Secrets Manager.
#
# RDS host/port come from Terraform-generated deployment.properties.
#
"$script_dir/render-rds-secret.sh" \
  "$MEMGINE_DB_SECRET_ARN" \
  "$config_root/backend-secrets.env" \
  "$MEMGINE_OTP_PEPPER_SECRET_ARN" \
  "$app_user" \
  "$MEMGINE_DB_HOST" \
  "$MEMGINE_DB_PORT"

#
# Install/update systemd service.
#
"$script_dir/../../backend/linux/install-backend-service.sh" \
  "$service_name" \
  "$app_user" \
  "$app_root" \
  "$config_root/backend.env" \
  "$active_jar" \
  "$config_root/backend-secrets.env"

#
# Start candidate backend and configure Nginx.
#
systemctl restart "$service_name"

"$script_dir/configure-nginx.sh" \
  "$environment_dir" \
  https

#
# Candidate must pass health checks before it becomes the rollback target.
#
if ! run_health_check_with_retry; then
  echo ""
  echo "Candidate release failed health checks: $release_id" >&2
  echo ""

  systemctl status "$service_name" --no-pager || true
  journalctl -u "$service_name" -n 150 --no-pager || true

  if rollback_to_last_successful_release; then
    echo ""
    echo "Deployment failed, but rollback completed successfully."
  else
    echo ""
    echo "Deployment failed and automatic rollback did not recover the service." >&2
  fi

  exit 1
fi

#
# Only now is the candidate considered successful.
#
record_last_successful_release "$release_id"

echo ""
echo "=============================================================="
echo " Memgine deployment successful"
echo "=============================================================="
echo "Environment           : $MEMGINE_ENVIRONMENT"
echo "Active release        : $release_id"
echo "Last successful       : $release_id"
echo "=============================================================="
