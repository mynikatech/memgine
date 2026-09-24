$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "Memgine LOCAL HTTP status"
Write-Host "-------------------------"

& (Join-Path $PSScriptRoot "status-frontend.ps1")
& (Join-Path $PSScriptRoot "status-backend.ps1")

Write-Host "Nginx    : NOT USED"
Write-Host ""
Write-Host "Frontend URL : http://localhost:8081"
Write-Host "API URL      : http://localhost:8082"
Write-Host ""