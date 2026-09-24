$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
& (Join-Path $repoRoot "server/scripts/common/backend/windows/stop-backend.ps1")