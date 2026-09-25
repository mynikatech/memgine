#!/usr/bin/env bash
set -euo pipefail

environment_dir="$1"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"
scripts_root="${MEMGINE_SCRIPTS_ROOT:-$repo_root/server/scripts}"
. "$scripts_root/common/env/linux/load-environment.sh"

env_file="$environment_dir/memgine.env"
[[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
load_memgine_environment_file "$env_file"

: "${MEMGINE_CERTBOT_EMAIL:?MEMGINE_CERTBOT_EMAIL is required}"
frontend_host="${MEMGINE_WEB_BASE_URL#*://}"
frontend_host="${frontend_host%%/*}"
api_host="${MEMGINE_API_BASE_URL#*://}"
api_host="${api_host%%/*}"

if [[ -n "${MEMGINE_EXPECTED_PUBLIC_IP:-}" ]]; then
  for host in "$frontend_host" "$api_host"; do
    getent ahostsv4 "$host" | awk '{ print $1 }' | sort -u | grep -Fx "$MEMGINE_EXPECTED_PUBLIC_IP" >/dev/null || {
      echo "DNS for $host does not resolve to expected Elastic IP." >&2
      exit 1
    }
  done
fi

"$scripts_root/common/deployment/linux/configure-nginx.sh" "$environment_dir" http
certbot certonly --webroot \
  --webroot-path "${MEMGINE_WEB_ROOT:-/var/www/memgine-${MEMGINE_ENVIRONMENT}}" \
  --domain "$frontend_host" \
  --domain "$api_host" \
  --email "$MEMGINE_CERTBOT_EMAIL" \
  --agree-tos \
  --non-interactive

"$scripts_root/common/deployment/linux/configure-nginx.sh" "$environment_dir" https
systemctl enable --now certbot-renew.timer
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/memgine-nginx-reload <<EOF
#!/usr/bin/env bash
${scripts_root}/common/deployment/linux/configure-nginx.sh ${environment_dir} https
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/memgine-nginx-reload
