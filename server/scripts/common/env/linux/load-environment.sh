#!/usr/bin/env bash

load_memgine_environment_file() {
  local env_file="$1"
  local line line_number=0 key value trimmed

  [[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; return 1; }

  while IFS= read -r line || [[ -n "$line" ]]; do
    ((line_number += 1))
    trimmed="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$trimmed" || "${trimmed:0:1}" == "#" ]] && continue
    [[ "$line" == *"="* ]] || { echo "Malformed environment entry at line $line_number in $env_file." >&2; return 1; }
    key="${line%%=*}"
    value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "Malformed environment variable name at line $line_number in $env_file." >&2; return 1; }
    export "$key=$value"
  done < "$env_file"
}