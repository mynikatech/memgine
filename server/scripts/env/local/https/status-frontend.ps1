$ErrorActionPreference = "Continue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path

& (Join-Path $repoRoot "server/scripts/common/frontend/windows/status-frontend.ps1") `
    -Port 8081