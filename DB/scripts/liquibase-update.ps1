
#
# Applies pending Liquibase changesets to the selected database.
# Unlike liquibase-update-sql.ps1, this script DOES modify the database.
#
# Supported environments:
#   local
#   dev
#   prod
#
# Usage from repository root:
#
#   .\DB\scripts\liquibase-update.ps1 -Environment local
#   .\DB\scripts\liquibase-update.ps1 -Environment dev
#   .\DB\scripts\liquibase-update.ps1 -Environment prod
#
# IMPORTANT:
#   Do NOT commit a properties file containing a real password.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("local", "dev", "prod")]
    [string]$Environment = "local"
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Get-Location).Path

$GradleWrapper = Join-Path `
    $RepoRoot `
    "gradlew.bat"

if (-not (Test-Path $GradleWrapper)) {
    throw "gradlew.bat was not found. Run this script from the Memgine repository root."
}

$EnvironmentDirectory = Join-Path `
    $RepoRoot `
    "DB\env\$Environment"

$PropertiesFile = Join-Path `
    $EnvironmentDirectory `
    "liquibase.$Environment.properties"

$MasterChangelog = Join-Path `
    $EnvironmentDirectory `
    "db.changelog-master.$Environment.yaml"

if (-not (Test-Path $PropertiesFile)) {
    throw "Liquibase properties file not found: $PropertiesFile"
}

if (-not (Test-Path $MasterChangelog)) {
    throw "Liquibase master changelog not found: $MasterChangelog"
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " Memgine Liquibase DATABASE UPDATE"
Write-Host "=============================================================="
Write-Host "Environment      : $Environment"
Write-Host "Properties       : $PropertiesFile"
Write-Host "Master changelog : $MasterChangelog"
Write-Host ""
Write-Host "WARNING: This command WILL MODIFY the selected database."
Write-Host ""

if ($Environment -eq "prod") {
    Write-Host "=============================================================="
    Write-Host " PRODUCTION DATABASE"
    Write-Host "=============================================================="
    Write-Host "You are about to apply Liquibase changes to PROD."
    Write-Host ""

    $Confirmation = Read-Host "Type APPLY-PROD to continue"

    if ($Confirmation -cne "APPLY-PROD") {
        Write-Host ""
        Write-Host "Production update cancelled."
        exit 0
    }

    Write-Host ""
}

Write-Host "Applying pending Liquibase changes..."
Write-Host ""

& $GradleWrapper `
    :DB:update `
    "-PdbEnvironment=$Environment"

if ($LASTEXITCODE -ne 0) {
    throw "Liquibase update failed with exit code $LASTEXITCODE."
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " Liquibase DATABASE UPDATE Complete"
Write-Host "=============================================================="
Write-Host "Environment : $Environment"
Write-Host ""
Write-Host "Pending Liquibase changes have been applied successfully."
Write-Host ""