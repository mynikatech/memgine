[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$HostNames,

    [string]$Address = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"

$currentPrincipal = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an elevated PowerShell session so it can update $hostsPath."
}

$existingLines = Get-Content -LiteralPath $hostsPath
$existingRaw = Get-Content -LiteralPath $hostsPath -Raw

$missing = @(
    $HostNames | Where-Object {
        $escaped = [regex]::Escape($_)

        -not (
            $existingLines -match "^\s*[^#\s]+\s+.*\b$escaped\b"
        )
    }
)

if ($missing.Count -gt 0) {

    # Ensure the existing hosts file ends with a newline before appending.
    if (
        $existingRaw.Length -gt 0 -and
        -not $existingRaw.EndsWith("`r`n") -and
        -not $existingRaw.EndsWith("`n")
    ) {
        [System.IO.File]::AppendAllText(
            $hostsPath,
            [Environment]::NewLine
        )
    }

    $entry = "{0}`t{1}" -f $Address, ($missing -join " ")

    [System.IO.File]::AppendAllText(
        $hostsPath,
        $entry + [Environment]::NewLine
    )

    Write-Host "Added hosts entry for: $($missing -join ', ')"

} else {

    Write-Host "Hosts entries are already present."
}