#!/usr/bin/env bash
set -euo pipefail

service_name="$1"
app_user="$2"
working_directory="$3"
env_file="$4"
jar_path="$5"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template="$script_dir/memgine.service.template"
target="/etc/systemd/system/${service_name}.service"

[[ "$EUID" -eq 0 ]] || { echo "Run setup as root (or with sudo) to install the systemd service." >&2; exit 1; }
[[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
[[ -f "$jar_path" ]] || { echo "Backend jar not found: $jar_path. Build :server:shadowJar first." >&2; exit 1; }
id "$app_user" >/dev/null 2>&1 || { echo "Application user does not exist: $app_user" >&2; exit 1; }
command -v java >/dev/null 2>&1 || { echo "Java is required but was not found." >&2; exit 1; }

sed \
  -e "s|__SERVICE_NAME__|$service_name|g" \
  -e "s|__APP_USER__|$app_user|g" \
  -e "s|__WORKING_DIRECTORY__|$working_directory|g" \
  -e "s|__ENV_FILE__|$env_file|g" \
  -e "s|__JAR_PATH__|$jar_path|g" \
  "$template" > "$target"
systemctl daemon-reload
systemctl enable "$service_name"
echo "Installed and enabled $service_name."