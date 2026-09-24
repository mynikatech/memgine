$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
& (Join-Path $repoRoot "server/scripts/common/frontend/windows/stop-frontend.ps1")