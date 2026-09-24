[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$NginxHome,
    [Parameter(Mandatory = $true)] [string]$Prefix,
    [Parameter(Mandatory = $true)] [string]$ConfigPath
)

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "validate-nginx.ps1") -NginxHome $NginxHome -Prefix $Prefix -ConfigPath $ConfigPath
$nginx = Join-Path $NginxHome "nginx.exe"
& $nginx -p $Prefix -c $ConfigPath
if ($LASTEXITCODE -ne 0) { throw "Nginx failed to start." }