#!/usr/bin/env bash
set -u

service_name="$1"

if systemctl is-active --quiet "$service_name"; then
    main_pid="$(systemctl show "$service_name" --property MainPID --value)"
    echo "Backend  : ACTIVE  service=$service_name  PID=$main_pid"
    exit 0
fi

status="$(systemctl is-active "$service_name" 2>/dev/null || true)"
echo "Backend  : ${status^^}  service=$service_name"
exit 1