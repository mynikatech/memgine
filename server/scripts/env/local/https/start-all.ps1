$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "start-nginx.ps1")

& (Join-Path $PSScriptRoot "start-backend.ps1")

Start-Sleep -Seconds 1

& (Join-Path $PSScriptRoot "start-frontend.ps1")

Write-Host "Started Memgine LOCAL HTTPS components."