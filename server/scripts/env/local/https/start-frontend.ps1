$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
& (Join-Path $repoRoot "server/scripts/common/frontend/windows/start-frontend.ps1") -FrontendPath (Join-Path $repoRoot "frontend") -EnvFile (Join-Path $PSScriptRoot "frontend.env")