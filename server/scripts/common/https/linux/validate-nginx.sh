#!/usr/bin/env bash

set -euo pipefail

nginx_binary="$1"
prefix="$2"
config_path="$3"

if [[ "$nginx_binary" != /* ]]; then
  nginx_binary="$(command -v "$nginx_binary" || true)"
fi

mkdir -p \
  "$prefix/logs" \
  "$prefix/runtime" \
  "$prefix/temp/client_body_temp" \
  "$prefix/temp/proxy_temp" \
  "$prefix/temp/fastcgi_temp" \
  "$prefix/temp/uwsgi_temp" \
  "$prefix/temp/scgi_temp"

if [[ -z "$nginx_binary" || ! -x "$nginx_binary" ]]; then
  echo "Nginx executable was not found or is not executable: $nginx_binary" >&2
  exit 1
fi

"$nginx_binary" -p "$prefix" -c "$config_path" -t
