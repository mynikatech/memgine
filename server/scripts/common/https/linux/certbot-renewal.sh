#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"

find_renewal_timer() {
  local timer service load_state
  while IFS= read -r timer; do
    [[ -n "$timer" ]] || continue
    service="$(systemctl show "$timer" --property=Unit --value 2>/dev/null || true)"
    [[ "$service" == *.service ]] || continue
    load_state="$(systemctl show "$service" --property=LoadState --value 2>/dev/null || true)"
    [[ "$load_state" != "not-found" && -n "$load_state" ]] || continue
    printf '%s|%s\n' "$timer" "$service"
    return 0
  done < <(systemctl list-unit-files --type=timer --no-legend | awk '$1 ~ /^certbot.*\.timer$/ { print $1 }')

  echo "No Certbot renewal systemd timer with a linked service was found." >&2
  return 1
}

check_renewal_configuration() {
  local timer service
  IFS='|' read -r timer service < <(find_renewal_timer)
  systemctl is-enabled --quiet "$timer" || {
    echo "Certbot renewal timer is not enabled: $timer" >&2
    return 1
  }
  systemctl is-active --quiet "$timer" || {
    echo "Certbot renewal timer is not active: $timer" >&2
    return 1
  }
  echo "Certbot renewal timer: $timer (enabled, active; service: $service)"
}

case "$action" in
  ensure)
    IFS='|' read -r timer _ < <(find_renewal_timer)
    systemctl enable --now "$timer"
    check_renewal_configuration
    ;;
  check)
    check_renewal_configuration
    ;;
  dry-run)
    check_renewal_configuration
    certbot renew --dry-run
    echo "Certbot renewal dry-run: OK"
    ;;
  *)
    echo "Usage: $0 <ensure|check|dry-run>" >&2
    exit 64
    ;;
esac
