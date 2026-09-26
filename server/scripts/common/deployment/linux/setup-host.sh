#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
shift || true

check_only=false
deploy_bucket=""
db_secret_arn=""
otp_pepper_secret_arn=""
expected_public_ip=""
notification_topic_arn=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check-only) check_only=true ;;
    --deploy-bucket) deploy_bucket="$2"; shift ;;
    --db-secret-arn) db_secret_arn="$2"; shift ;;
    --otp-pepper-secret-arn) otp_pepper_secret_arn="$2"; shift ;;
    --expected-public-ip) expected_public_ip="$2"; shift ;;
    --notification-topic-arn) notification_topic_arn="$2"; shift ;;
    *) echo "Unsupported setup-host argument: $1" >&2; exit 64 ;;
  esac
  shift
done

[[ "$environment" == "dev" || "$environment" == "prod" ]] || { echo "Unsupported environment: $environment" >&2; exit 64; }
[[ "$EUID" -eq 0 ]] || { echo "Host setup must run as root." >&2; exit 1; }

app_name="memgine"
app_root="/opt/$app_name"
scripts_root="$app_root/scripts"
environment_dir="$scripts_root/env/$environment/https"

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "Required command is unavailable: $1" >&2; exit 1; }
}

require_command java
java -version 2>&1 | grep -Eq 'version "21\.|openjdk 21|java 21' || { echo "Java 21 is required." >&2; exit 1; }
for command in nginx aws jq certbot curl openssl; do require_command "$command"; done
id "$app_name" >/dev/null 2>&1 || { echo "Application user is unavailable: $app_name" >&2; exit 1; }
for directory in "$app_root" "$app_root/server" "$app_root/releases" "$app_root/config" "/var/www/$app_name-$environment"; do
  [[ -d "$directory" ]] || { echo "Required directory is unavailable: $directory" >&2; exit 1; }
done
[[ -d "$environment_dir" ]] || { echo "Environment scripts are unavailable: $environment_dir" >&2; exit 1; }

if [[ "$check_only" == true ]]; then
  for file in "$environment_dir/memgine.env" "$environment_dir/frontend.env" "$environment_dir/deployment.properties"; do
    [[ -f "$file" ]] || { echo "Required runtime configuration is unavailable: $file" >&2; exit 1; }
  done
  "$scripts_root/common/https/linux/check-certificates.sh" "$environment_dir"
  "$scripts_root/common/https/linux/certbot-renewal.sh" check
  nginx -t
  systemctl is-active --quiet nginx
  echo "Memgine host setup validation passed for $environment."
  exit 0
fi

[[ -n "$deploy_bucket" && -n "$db_secret_arn" && -n "$otp_pepper_secret_arn" && -n "$expected_public_ip" ]] || {
  echo "Deployment bucket, database secret ARN, OTP pepper secret ARN, and expected public IP are required." >&2
  exit 64
}

ensure_runtime_file() {
  local file="$1"
  local example="${file}.example"
  [[ -f "$file" ]] || cp "$example" "$file"
}

set_environment_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local temporary="${file}.tmp"
  grep -v "^${key}=" "$file" > "$temporary" || true
  printf '%s=%s\n' "$key" "$value" >> "$temporary"
  install -o "$app_name" -g "$app_name" -m 0640 "$temporary" "$file"
  rm -f "$temporary"
}

ensure_runtime_file "$environment_dir/memgine.env"
ensure_runtime_file "$environment_dir/frontend.env"
set_environment_value "$environment_dir/memgine.env" "MEMGINE_EXPECTED_PUBLIC_IP" "$expected_public_ip"

deployment_file="$environment_dir/deployment.properties"
temporary_deployment_file="${deployment_file}.tmp"
{
  printf 'MEMGINE_ENVIRONMENT=%s\n' "$environment"
  printf 'MEMGINE_APP_USER=%s\n' "$app_name"
  printf 'MEMGINE_APP_ROOT=%s\n' "$app_root"
  printf 'MEMGINE_WEB_ROOT=/var/www/%s-%s\n' "$app_name" "$environment"
  printf 'MEMGINE_DEPLOY_BUCKET=%s\n' "$deploy_bucket"
  printf 'MEMGINE_DB_SECRET_ARN=%s\n' "$db_secret_arn"
  printf 'MEMGINE_OTP_PEPPER_SECRET_ARN=%s\n' "$otp_pepper_secret_arn"
  printf 'MEMGINE_EXPECTED_PUBLIC_IP=%s\n' "$expected_public_ip"
  if [[ -n "$notification_topic_arn" ]]; then
    printf 'MEMGINE_NOTIFICATION_EVENTS_TOPIC_ARN=%s\n' "$notification_topic_arn"
  fi
} > "$temporary_deployment_file"
install -o "$app_name" -g "$app_name" -m 0640 "$temporary_deployment_file" "$deployment_file"
rm -f "$temporary_deployment_file"

export MEMGINE_SCRIPTS_ROOT="$scripts_root"
"$scripts_root/setup-https.sh" "$environment"

systemctl is-active --quiet nginx
"$scripts_root/common/https/linux/check-certificates.sh" "$environment_dir"
"$scripts_root/common/https/linux/certbot-renewal.sh" dry-run
for url in "$(grep '^MEMGINE_WEB_BASE_URL=' "$environment_dir/memgine.env" | cut -d= -f2-)" "$(grep '^MEMGINE_API_BASE_URL=' "$environment_dir/memgine.env" | cut -d= -f2-)"; do
  curl --silent --show-error --head --output /dev/null "$url"
done
echo "Memgine host setup completed for $environment."
