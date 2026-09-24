[CmdletBinding()]
param([int]$Port = 8081)

$ErrorActionPreference = "Stop"
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if ($listeners.Count -eq 0) { Write-Host "Memgine frontend is not listening on port $Port."; exit 0 }
foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    if ($null -eq $process -or $process.CommandLine -notmatch 'expo|memgine') {
        throw "Port $Port is owned by a process that is not identified as the Memgine Expo frontend; refusing to stop it."
    }
    Stop-Process -Id $listener.OwningProcess -Force
    Write-Host "Stopped Memgine frontend PID $($listener.OwningProcess)."
}