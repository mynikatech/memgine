#!/usr/bin/env bash
set -euo pipefail

secret_arn="$1"
target_file="$2"
otp_pepper_secret_arn="$3"
app_user="${4:-memgine}"
database_host="$5"
database_port="$6"

[[ -n "$database_host" ]] || { echo "Database host is empty." >&2; exit 1; }

if ! [[ "$database_port" =~ ^[0-9]+$ ]] || (( database_port < 1 || database_port > 65535 )); then
  echo "Database port is invalid: $database_port" >&2
  exit 1
fi

secret_json="$(aws secretsmanager get-secret-value --secret-id "$secret_arn" --query SecretString --output text)"
database="$(jq -er '.database // .dbname' <<< "$secret_json")"
username="$(jq -er '.username' <<< "$secret_json")"
password="$(jq -er '.password' <<< "$secret_json")"
otp_pepper="$(aws secretsmanager get-secret-value --secret-id "$otp_pepper_secret_arn" --query SecretString --output text)"

[[ -n "$database" ]] || { echo "Database name is empty in runtime DB secret." >&2; exit 1; }
[[ -n "$username" ]] || { echo "Database username is empty in runtime DB secret." >&2; exit 1; }
[[ -n "$password" ]] || { echo "Database password is empty in runtime DB secret." >&2; exit 1; }
[[ -n "$otp_pepper" ]] || { echo "OTP pepper secret is empty." >&2; exit 1; }

umask 077
tmp_file="${target_file}.tmp"

{
  printf 'MEMGINE_DB_URL=jdbc:postgresql://%s:%s/%s\n' "$database_host" "$database_port" "$database"
  printf 'MEMGINE_DB_USER=%q\n' "$username"
  printf 'MEMGINE_DB_PASSWORD=%q\n' "$password"
  printf 'MEMGINE_OTP_PEPPER=%q\n' "$otp_pepper"
} > "$tmp_file"

install -o "$app_user" -g "$app_user" -m 0600 "$tmp_file" "$target_file"
rm -f "$tmp_file"
