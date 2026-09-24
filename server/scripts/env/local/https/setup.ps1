$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../../../..")).Path
$common = Join-Path $repoRoot "server/scripts/common/https/windows"
$certs = Join-Path $PSScriptRoot "certs"

& (Join-Path $common "generate-certs.ps1") `
    -CertificatePath (Join-Path $certs "memgine.crt") `
    -KeyPath (Join-Path $certs "memgine.key") `
    -HostNames @("memgine.local", "api.memgine.local")
& (Join-Path $common "add-hosts.ps1") -HostNames @("memgine.local", "api.memgine.local")