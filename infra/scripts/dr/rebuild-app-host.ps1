[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [Parameter(Mandatory = $true)]
    [ValidateSet("plan", "apply")]
    [string]$TerraformAction,

    [string]$KnownGoodReleaseId,

    [string]$Confirmation
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$TerraformScript = Join-Path $RepoRoot "infra\scripts\deploy.ps1"

if ($TerraformAction -eq "apply") {
    if ([string]::IsNullOrWhiteSpace($KnownGoodReleaseId)) {
        throw "-KnownGoodReleaseId is required when TerraformAction is apply."
    }

    $expectedConfirmation = "REBUILD-$($Environment.ToUpperInvariant())-APP-HOST"
    if ($Confirmation -cne $expectedConfirmation) {
        throw "Confirmation must be exactly $expectedConfirmation."
    }
}

Write-Host "Application-host rebuild"
Write-Host "Environment: $Environment"
Write-Host "Action     : $TerraformAction"
if ($KnownGoodReleaseId) {
    Write-Host "Release    : $KnownGoodReleaseId"
}

& $TerraformScript $Environment $TerraformAction
if ($LASTEXITCODE -ne 0) {
    throw "Terraform application-host operation failed."
}

if ($TerraformAction -eq "plan") {
    Write-Host "Review the saved Terraform plan. No rebuild or deployment occurred."
    exit 0
}

Write-Host ""
Write-Host "Terraform completed. After confirming the replacement host is SSM-online, deploy the approved release using the existing server/scripts/deploy.sh $Environment $KnownGoodReleaseId workflow through SSM."
Write-Host "Do not cut traffic over until infra/scripts/dr/validate-recovery.ps1 succeeds."
