[CmdletBinding()]
param(
    [int]$Port = 8082
)

$ErrorActionPreference = "Stop"

$listeners = @(
    Get-NetTCPConnection `
        -State Listen `
        -LocalPort $Port `
        -ErrorAction SilentlyContinue
)

if ($listeners.Count -eq 0) {
    Write-Host "Backend  : STOPPED  port $Port"
    exit 1
}

$processId = $listeners[0].OwningProcess
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"

if (
    $null -ne $process -and
    $process.CommandLine -match 'memgine|ApplicationKt|gradle|java'
) {
    Write-Host "Backend  : RUNNING  port $Port  PID $processId"
    exit 0
}

Write-Host "Backend  : UNKNOWN  port $Port is owned by PID $processId"
exit 2