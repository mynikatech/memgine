$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "Memgine LOCAL HTTPS status"
Write-Host "--------------------------"

& (Join-Path $PSScriptRoot "status-frontend.ps1")
& (Join-Path $PSScriptRoot "status-backend.ps1")
& (Join-Path $PSScriptRoot "status-nginx.ps1")

Write-Host ""
Write-Host "Frontend URL : https://memgine.local"
Write-Host "API URL      : https://api.memgine.local"
Write-Host ""