$ErrorActionPreference = "Continue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path

& (Join-Path $repoRoot "server/scripts/common/backend/windows/status-backend.ps1") `
    -Port 8082