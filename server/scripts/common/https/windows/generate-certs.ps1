[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CertificatePath,

    [Parameter(Mandatory = $true)]
    [string]$KeyPath,

    [Parameter(Mandatory = $true)]
    [string[]]$HostNames
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    throw "mkcert was not found on PATH. Install mkcert and run 'mkcert -install' before generating certificates."
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CertificatePath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $KeyPath) | Out-Null

& mkcert -cert-file $CertificatePath -key-file $KeyPath @HostNames
if ($LASTEXITCODE -ne 0) {
    throw "mkcert failed to generate the requested certificate."
}