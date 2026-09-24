[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$NginxHome,
    [Parameter(Mandatory = $true)] [string]$Prefix,
    [Parameter(Mandatory = $true)] [string]$ConfigPath
)

$ErrorActionPreference = "Stop"
$nginx = Join-Path $NginxHome "nginx.exe"
if (-not (Test-Path -LiteralPath $nginx)) {
    throw "nginx.exe was not found at $nginx. Set MEMGINE_NGINX_HOME to the Nginx for Windows directory."
}
& $nginx -p $Prefix -c $ConfigPath -s quit
if ($LASTEXITCODE -ne 0) { throw "Nginx failed to stop." }