$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "start-backend.ps1")
Start-Sleep -Seconds 1
Start-Process -FilePath powershell.exe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "start-frontend.ps1") | Out-Null
Write-Host "Started Memgine LOCAL HTTP backend and frontend."