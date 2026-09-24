[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$FrontendPath,

    [Parameter(Mandatory = $true)]
    [string]$EnvFile,

    [int]$Port = 8081
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $FrontendPath)) {
    throw "Frontend path not found: $FrontendPath"
}

. (Join-Path $PSScriptRoot "../../env/windows/Import-EnvironmentFile.ps1")

Import-MemgineEnvironmentFile -Path $EnvFile

$listener = Get-NetTCPConnection `
    -State Listen `
    -LocalPort $Port `
    -ErrorAction SilentlyContinue

if ($listener) {
    Write-Host "Frontend is already listening on port $Port."
    exit 0
}

Write-Host "Starting Memgine frontend on port $Port."

Start-Process `
    -FilePath "cmd.exe" `
    -WorkingDirectory $FrontendPath `
    -ArgumentList @(
        "/k",
        "npx expo start --web --port $Port"
    ) | Out-Null