$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($env:MEMGINE_NGINX_HOME)) {
    throw "Set MEMGINE_NGINX_HOME to the Nginx for Windows directory before reloading Nginx."
}
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
& (Join-Path $repoRoot "server/scripts/common/https/windows/reload-nginx.ps1") `
    -NginxHome $env:MEMGINE_NGINX_HOME `
    -Prefix $PSScriptRoot `
    -ConfigPath "nginx.conf"