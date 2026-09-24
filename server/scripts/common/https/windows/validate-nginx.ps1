[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$NginxHome,

    [Parameter(Mandatory = $true)]
    [string]$Prefix,

    [Parameter(Mandatory = $true)]
    [string]$ConfigPath
)

$ErrorActionPreference = "Stop"

# These directories are Nginx-for-Windows runtime implementation details.
# They are created automatically under the supplied environment prefix.
$requiredDirectories = @(
    "logs",
    "runtime",
    "temp\client_body_temp",
    "temp\proxy_temp",
    "temp\fastcgi_temp",
    "temp\uwsgi_temp",
    "temp\scgi_temp"
)

foreach ($relativePath in $requiredDirectories) {
    $fullPath = Join-Path $Prefix $relativePath

    if (-not (Test-Path -LiteralPath $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
    }
}

$nginx = Join-Path $NginxHome "nginx.exe"

if (-not (Test-Path -LiteralPath $nginx)) {
    throw "nginx.exe was not found at $nginx. Set MEMGINE_NGINX_HOME to the Nginx for Windows directory."
}

& $nginx -p $Prefix -c $ConfigPath -t

if ($LASTEXITCODE -ne 0) {
    throw "Nginx configuration validation failed."
}