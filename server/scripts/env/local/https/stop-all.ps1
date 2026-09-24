$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "stop-frontend.ps1")
& (Join-Path $PSScriptRoot "stop-backend.ps1")
if (Get-Process -Name nginx -ErrorAction SilentlyContinue) { & (Join-Path $PSScriptRoot "stop-nginx.ps1") }
Write-Host "Stopped Memgine LOCAL HTTPS components."