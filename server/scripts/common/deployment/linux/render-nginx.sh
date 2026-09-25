#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
mode="$2"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$script_dir/../../env/linux/load-environment.sh"

env_file="$environment_dir/memgine.env"
[[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
load_memgine_environment_file "$env_file"

frontend_host="${MEMGINE_WEB_BASE_URL#*://}"
frontend_host="${frontend_host%%/*}"
api_host="${MEMGINE_API_BASE_URL#*://}"
api_host="${api_host%%/*}"
web_root="${MEMGINE_WEB_ROOT:-/var/www/memgine-${MEMGINE_ENVIRONMENT}}"
target="$environment_dir/conf.d/memgine.conf"
export FRONTEND_HOST="$frontend_host"
export API_HOST="$api_host"
export WEB_ROOT="$web_root"

case "$mode" in
  http)
    cat > "$target" <<EOF
server {
    listen 80;
    server_name ${frontend_host};
    root ${web_root};
    index index.html;

    location /.well-known/acme-challenge/ { root ${web_root}; }
    location / { try_files \$uri \$uri/ /index.html; }
}

server {
    listen 80;
    server_name ${api_host};

    location /.well-known/acme-challenge/ { root ${web_root}; }
    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    ;;
  https)
    envsubst '${FRONTEND_HOST} ${API_HOST} ${WEB_ROOT}' \
      < "$script_dir/nginx-https.conf.template" \
      > "$target"
    ;;
  *)
    echo "Usage: $0 <environment-dir> <http|https>" >&2
    exit 64
    ;;
esac
