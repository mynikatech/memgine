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

# One-time compatibility bridge for the deployed DEV callback credential.
# Capture only an existing host-local direct value before the sanitized release
# configuration replaces memgine.env. The value never enters S3 or backend.env.
legacy_callback_secret_file="$environment_dir/poynt-payment-bridge-callback.secret"
if [[ "$environment" == "dev" && -f "$environment_dir/memgine.env" ]]; then
  legacy_callback_value="$(grep -m 1 '^MEMGINE_POYNT_PAYMENT_BRIDGE_CALLBACK_HEADER_VALUE=' "$environment_dir/memgine.env" | cut -d= -f2- || true)"
  if [[ -n "$legacy_callback_value" ]]; then
    [[ "$legacy_callback_value" != *$'\n'* && "$legacy_callback_value" != *$'\r'* ]] || {
      echo "Existing DEV Poynt callback value has invalid line breaks." >&2
      exit 1
    }
    legacy_callback_tmp="$(mktemp "$environment_dir/poynt-payment-bridge-callback.secret.XXXXXX")"
    printf '%s' "$legacy_callback_value" > "$legacy_callback_tmp"
    chmod 0600 "$legacy_callback_tmp"
    mv -f "$legacy_callback_tmp" "$legacy_callback_secret_file"
  fi
fi

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
