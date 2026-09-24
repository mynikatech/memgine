[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$processes = @(Get-Process -Name nginx -ErrorAction SilentlyContinue)

if ($processes.Count -eq 0) {
    Write-Host "Nginx    : STOPPED"
    exit 1
}

$pids = ($processes | Select-Object -ExpandProperty Id) -join ", "

$httpsListeners = @(
    Get-NetTCPConnection `
        -State Listen `
        -LocalPort 443 `
        -ErrorAction SilentlyContinue
)

if ($httpsListeners.Count -gt 0) {
    Write-Host "Nginx    : RUNNING  HTTPS 443  PID(s) $pids"
}
else {
    Write-Host "Nginx    : RUNNING  PID(s) $pids  but port 443 is not listening"
}

exit 0