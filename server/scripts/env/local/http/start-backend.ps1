$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
& (Join-Path $repoRoot "server/scripts/common/backend/windows/start-backend.ps1") -RepositoryRoot $repoRoot -EnvFile (Join-Path $PSScriptRoot "memgine.env")