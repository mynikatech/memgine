[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,

    [Parameter(Mandatory = $true)]
    [string]$EnvFile,

    [int]$Port = 8082
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "../../env/windows/Import-EnvironmentFile.ps1")

Import-MemgineEnvironmentFile -Path $EnvFile

$listener = Get-NetTCPConnection `
    -State Listen `
    -LocalPort $Port `
    -ErrorAction SilentlyContinue

if ($listener) {
    $process = Get-CimInstance `
        Win32_Process `
        -Filter "ProcessId = $($listener[0].OwningProcess)"

    if ($process.CommandLine -match 'memgine|ApplicationKt|gradle|java') {
        Write-Host "Memgine backend is already listening on port $Port (PID $($listener[0].OwningProcess))."
        exit 0
    }

    throw "Port $Port is already in use by an unrelated process."
}

$gradle = Join-Path $RepositoryRoot "gradlew.bat"

if (-not (Test-Path -LiteralPath $gradle)) {
    throw "Gradle wrapper not found: $gradle"
}

Write-Host "Starting Memgine backend on port $Port."

Start-Process `
    -FilePath "cmd.exe" `
    -WorkingDirectory $RepositoryRoot `
    -ArgumentList @(
        "/c",
        "`"$gradle`" :server:run --no-daemon"
    ) | Out-Null