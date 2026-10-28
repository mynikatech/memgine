#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
restore_from=""

if [[ "${2:-}" == "--restore-from" ]]; then
  restore_from="${3:-}"
  [[ -n "$restore_from" && -z "${4:-}" ]] || {
    echo "Usage: $0 <environment-dir> [--restore-from <backup-file>]" >&2
    exit 64
  }
elif [[ -n "${2:-}" ]]; then
  echo "Usage: $0 <environment-dir> [--restore-from <backup-file>]" >&2
  exit 64
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$script_dir/../../env/linux/load-environment.sh"

runtime_env_file="$environment_dir/memgine.env"
deployment_file="$environment_dir/deployment.properties"

load_memgine_environment_file "$runtime_env_file"
[[ -f "$deployment_file" ]] && load_memgine_environment_file "$deployment_file"

enabled="${MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED:-false}"

case "$enabled" in
  false)
    [[ -z "$restore_from" ]] || {
      echo "Apple Pay association restore requested while installation is disabled." >&2
      exit 1
    }
    echo "Apple Pay association installation is disabled."
    exit 0
    ;;
  true)
    ;;
  *)
    echo "MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED must be true or false." >&2
    exit 1
    ;;
esac

install_path="${MEMGINE_APPLE_PAY_ASSOCIATION_INSTALL_PATH:-}"
web_root="${MEMGINE_WEB_ROOT:-}"

[[ -n "$install_path" && "$install_path" == /* ]] || {
  echo "MEMGINE_APPLE_PAY_ASSOCIATION_INSTALL_PATH must be an absolute path when enabled." >&2
  exit 1
}

[[ "$install_path" =~ ^[A-Za-z0-9._/@+=:-]+$ ]] &&
  [[ "$install_path" != *"/../"* && "$install_path" != */.. ]] || {
  echo "MEMGINE_APPLE_PAY_ASSOCIATION_INSTALL_PATH contains unsupported path characters." >&2
  exit 1
}

if [[ -n "$web_root" ]]; then
  normalized_install_path="$(realpath -m "$install_path")"
  normalized_web_root="$(realpath -m "$web_root")"
  [[ "$normalized_install_path" != "$normalized_web_root" &&
     "$normalized_install_path" != "$normalized_web_root"/* ]] || {
    echo "Apple Pay association file must be outside MEMGINE_WEB_ROOT." >&2
    exit 1
  }
fi

validate_association_file() {
  local candidate="$1"
  local prefix compact

  [[ -s "$candidate" ]] || {
    echo "Apple Pay association artifact is empty." >&2
    return 1
  }

  prefix="$(head -c 1024 "$candidate" | LC_ALL=C tr '[:upper:]' '[:lower:]')"
  compact="$(printf '%s' "$prefix" | tr -d '[[:space:]]')"

  case "$compact" in
    '<!doctypehtml'*|'<html'*|'{'*|'['*)
      echo "Apple Pay association artifact appears to be an HTML or JSON error response." >&2
      return 1
      ;;
  esac
}

install_dir="$(dirname "$install_path")"
install -d -o root -g root -m 0755 "$install_dir"
temporary_file="$(mktemp "$install_dir/.apple-pay-association.XXXXXX")"
trap 'rm -f "$temporary_file"' EXIT

if [[ -n "$restore_from" ]]; then
  [[ "$restore_from" == /* && -f "$restore_from" ]] || {
    echo "Apple Pay association backup is unavailable." >&2
    exit 1
  }
  cp -- "$restore_from" "$temporary_file"
else
  source_bucket="${MEMGINE_APPLE_PAY_ASSOCIATION_S3_BUCKET:-}"
  source_key="${MEMGINE_APPLE_PAY_ASSOCIATION_S3_KEY:-}"

  [[ -n "$source_bucket" && -n "$source_key" ]] || {
    echo "Apple Pay association S3 bucket and key are required when enabled." >&2
    exit 1
  }
  [[ "$source_key" != /* && "$source_key" != *$'\n'* && "$source_key" != *$'\r'* ]] || {
    echo "MEMGINE_APPLE_PAY_ASSOCIATION_S3_KEY is invalid." >&2
    exit 1
  }
  case "$source_key" in
    releases/*/frontend/*)
      echo "Apple Pay association artifact must not be stored in a versioned frontend release path." >&2
      exit 1
      ;;
  esac

  aws s3 cp "s3://${source_bucket}/${source_key}" "$temporary_file"
fi

validate_association_file "$temporary_file"
chown root:root "$temporary_file"
chmod 0644 "$temporary_file"
mv -f "$temporary_file" "$install_path"
trap - EXIT

echo "Apple Pay association file installed atomically (SHA-256: $(sha256sum "$install_path" | awk '{print $1}'))."
