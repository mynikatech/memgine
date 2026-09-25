#!/usr/bin/env bash
set -euo pipefail

secret_arn="$1"
target_file="$2"

secret_json="$(aws secretsmanager get-secret-value --secret-id "$secret_arn" --query SecretString --output text)"
host="$(jq -er '.host' <<< "$secret_json")"
port="$(jq -er '.port' <<< "$secret_json")"
database="$(jq -er '.database // .dbname' <<< "$secret_json")"
username="$(jq -er '.username' <<< "$secret_json")"
password="$(jq -er '.password' <<< "$secret_json")"

umask 077
tmp_file="${target_file}.tmp"
{
  printf 'MEMGINE_DB_URL=jdbc:postgresql://%s:%s/%s\n' "$host" "$port" "$database"
  printf 'MEMGINE_DB_USER=%q\n' "$username"
  printf 'MEMGINE_DB_PASSWORD=%q\n' "$password"
} > "$tmp_file"
install -m 0600 "$tmp_file" "$target_file"
rm -f "$tmp_file"
