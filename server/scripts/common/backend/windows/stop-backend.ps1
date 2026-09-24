[CmdletBinding()]
param([int]$Port = 8082)

$ErrorActionPreference = "Stop"
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if ($listeners.Count -eq 0) { Write-Host "Memgine backend is not listening on port $Port."; exit 0 }

foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    if ($null -eq $process -or $process.CommandLine -notmatch 'memgine|ApplicationKt|gradle') {
        throw "Port $Port is owned by a process that is not identified as Memgine; refusing to stop it."
    }
    Stop-Process -Id $listener.OwningProcess -Force
    Write-Host "Stopped Memgine backend PID $($listener.OwningProcess)."
}