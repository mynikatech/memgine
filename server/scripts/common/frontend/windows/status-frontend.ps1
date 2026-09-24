[CmdletBinding()]
param(
    [int]$Port = 8081
)

$ErrorActionPreference = "Stop"

$listeners = @(
    Get-NetTCPConnection `
        -State Listen `
        -LocalPort $Port `
        -ErrorAction SilentlyContinue
)

if ($listeners.Count -eq 0) {
    Write-Host "Frontend : STOPPED  port $Port"
    exit 1
}

$processId = $listeners[0].OwningProcess
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"

if (
    $null -ne $process -and
    $process.CommandLine -match 'expo|node|memgine'
) {
    Write-Host "Frontend : RUNNING  port $Port  PID $processId"
    exit 0
}

Write-Host "Frontend : UNKNOWN  port $Port is owned by PID $processId"
exit 2