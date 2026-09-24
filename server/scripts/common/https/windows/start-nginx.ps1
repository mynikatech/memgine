[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$NginxHome,
    [Parameter(Mandatory = $true)] [string]$Prefix,
    [Parameter(Mandatory = $true)] [string]$ConfigPath
)

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "validate-nginx.ps1") -NginxHome $NginxHome -Prefix $Prefix -ConfigPath $ConfigPath
$nginx = Join-Path $NginxHome "nginx.exe"
$process = Start-Process `
    -FilePath $nginx `
    -ArgumentList @(
        "-p", "`"$Prefix`"",
        "-c", "`"$ConfigPath`""
    ) `
    -PassThru

Start-Sleep -Milliseconds 500

if ($process.HasExited -and $process.ExitCode -ne 0) {
    throw "Nginx failed to start with exit code $($process.ExitCode)."
}

Write-Host "Nginx startup initiated."