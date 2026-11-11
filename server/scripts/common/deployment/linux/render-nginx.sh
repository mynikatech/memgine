#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
mode="$2"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$script_dir/../../env/linux/load-environment.sh"

env_file="$environment_dir/memgine.env"
[[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
load_memgine_environment_file "$env_file"

deployment_file="$environment_dir/deployment.properties"
[[ -f "$deployment_file" ]] && load_memgine_environment_file "$deployment_file"

frontend_host="${MEMGINE_WEB_BASE_URL#*://}"
frontend_host="${frontend_host%%/*}"
api_host="${MEMGINE_API_BASE_URL#*://}"
api_host="${api_host%%/*}"
web_root="${MEMGINE_WEB_ROOT:-/var/www/memgine-${MEMGINE_ENVIRONMENT}}"
server_port="${MEMGINE_SERVER_PORT:-}"
target="$environment_dir/conf.d/memgine.conf"
[[ "$server_port" =~ ^[0-9]+$ ]] && (( server_port >= 1 && server_port <= 65535 )) || {
  echo "MEMGINE_SERVER_PORT is invalid." >&2
  exit 1
}
export FRONTEND_HOST="$frontend_host"
export API_HOST="$api_host"
export WEB_ROOT="$web_root"
export SERVER_PORT="$server_port"
# Allow larger branding image uploads on DEV only.
# Preserve the existing Nginx 1 MB request limit on PROD.
case "${MEMGINE_ENVIRONMENT:-}" in
  dev)
    export NGINX_API_MAX_BODY_SIZE="12m"
    ;;
  *)
    export NGINX_API_MAX_BODY_SIZE="1m"
    ;;
esac

apple_pay_association_location() {
  local enabled="${MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED:-false}"
  local install_path

  case "$enabled" in
    false)
      printf '%s\n' '    location = /.well-known/apple-developer-merchantid-domain-association { return 404; }'
      return 0
      ;;
    true)
      install_path="${MEMGINE_APPLE_PAY_ASSOCIATION_INSTALL_PATH:-}"
      [[ -n "$install_path" && "$install_path" == /* &&
         "$install_path" =~ ^[A-Za-z0-9._/@+=:-]+$ ]] || {
        echo "MEMGINE_APPLE_PAY_ASSOCIATION_INSTALL_PATH is invalid." >&2
        return 1
      }
      printf '%s\n' "    location = /.well-known/apple-developer-merchantid-domain-association { alias ${install_path}; default_type text/plain; add_header X-Content-Type-Options nosniff always; }"
      return 0
      ;;
    *)
      echo "MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED must be true or false." >&2
      return 1
      ;;
  esac
}

APPLE_PAY_ASSOCIATION_LOCATION="$(apple_pay_association_location)"
export APPLE_PAY_ASSOCIATION_LOCATION

case "$mode" in
  http)
    cat > "$target" <<EOF
server {
    listen 80;
    server_name ${frontend_host};
    root ${web_root};
    index index.html;

    location /.well-known/acme-challenge/ { root ${web_root}; }
    location = /.well-known/assetlinks.json { try_files \$uri =404; default_type application/json; }
    location = /.well-known/apple-app-site-association { try_files \$uri =404; default_type application/json; }
${APPLE_PAY_ASSOCIATION_LOCATION}
    location / { try_files \$uri \$uri/ /index.html; }
}

server {
    listen 80;
    server_name ${api_host};

    location /.well-known/acme-challenge/ { root ${web_root}; }
    location / {
        proxy_pass http://127.0.0.1:${server_port};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    ;;
  https)
    envsubst '${FRONTEND_HOST} ${API_HOST} ${WEB_ROOT} ${SERVER_PORT} ${APPLE_PAY_ASSOCIATION_LOCATION} ${NGINX_API_MAX_BODY_SIZE}' \
      < "$script_dir/nginx-https.conf.template" \
      > "$target"
    ;;
  *)
    echo "Usage: $0 <environment-dir> <http|https>" >&2
    exit 64
    ;;
esac
