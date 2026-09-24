$ErrorActionPreference = "Continue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path

& (Join-Path $repoRoot "server/scripts/common/https/windows/status-nginx.ps1")