#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$script_dir/../../env/linux/load-environment.sh"

runtime_env_file="$environment_dir/memgine.env"
deployment_file="$environment_dir/deployment.properties"

load_memgine_environment_file "$runtime_env_file"
[[ -f "$deployment_file" ]] && load_memgine_environment_file "$deployment_file"

[[ "${MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED:-false}" == "true" ]] || {
  echo "Apple Pay association verification requires MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED=true." >&2
  exit 1
}

install_path="${MEMGINE_APPLE_PAY_ASSOCIATION_INSTALL_PATH:-}"
web_base_url="${MEMGINE_WEB_BASE_URL:-}"

[[ -f "$install_path" ]] || {
  echo "Installed Apple Pay association file is unavailable." >&2
  exit 1
}
[[ "$web_base_url" == https://* ]] || {
  echo "MEMGINE_WEB_BASE_URL must be HTTPS for Apple Pay association verification." >&2
  exit 1
}

url="${web_base_url%/}/.well-known/apple-developer-merchantid-domain-association"
response_file="$(mktemp)"
headers_file="$(mktemp)"
trap 'rm -f "$response_file" "$headers_file"' EXIT

if ! http_status="$(curl \
    --silent \
    --show-error \
    --proto '=https' \
    --max-redirs 0 \
    --connect-timeout 10 \
    --max-time 30 \
    --dump-header "$headers_file" \
    --output "$response_file" \
    --write-out '%{http_code}' \
    "$url")"; then
  echo "Apple Pay association public request failed." >&2
  exit 1
fi

[[ "$http_status" == "200" ]] || {
  echo "Apple Pay association public request returned HTTP ${http_status}; expected 200 without redirects." >&2
  exit 1
}

prefix="$(head -c 1024 "$response_file" | LC_ALL=C tr '[:upper:]' '[:lower:]')"
compact="$(printf '%s' "$prefix" | tr -d '[[:space:]]')"
case "$compact" in
  '<!doctypehtml'*|'<html'*|'{'*|'['*)
    echo "Apple Pay association public response appears to be an HTML or JSON fallback." >&2
    exit 1
    ;;
esac

installed_sha256="$(sha256sum "$install_path" | awk '{print $1}')"
public_sha256="$(sha256sum "$response_file" | awk '{print $1}')"

[[ "$installed_sha256" == "$public_sha256" ]] || {
  echo "Apple Pay association public response checksum does not match the installed artifact." >&2
  exit 1
}

echo "Apple Pay association verification passed (HTTP 200, SHA-256: ${public_sha256})."
