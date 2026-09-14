# Memgine Liquibase SQL Preview
#
# Generates the SQL Liquibase WOULD execute.
# This script DOES NOT modify the database.
#
# Supported environments:
#   local
#   dev
#   prod
#
# Usage from repository root:
#
#   .\DB\scripts\liquibase-update-sql.ps1 -Environment local
#
#   .\DB\scripts\liquibase-update-sql.ps1 -Environment dev
#
#   .\DB\scripts\liquibase-update-sql.ps1 -Environment prod
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

# ------------------------------------------------------------
# Repository root
# ------------------------------------------------------------

$RepoRoot = (Get-Location).Path

$GradleWrapper = Join-Path `
    $RepoRoot `
    "gradlew.bat"

if (-not (Test-Path $GradleWrapper)) {
    throw "gradlew.bat was not found. Run this script from the Memgine repository root."
}

# ------------------------------------------------------------
# Validate environment-specific Liquibase configuration
# ------------------------------------------------------------

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

# ------------------------------------------------------------
# Prepare output directory
# ------------------------------------------------------------

$OutputDirectory = Join-Path `
    $RepoRoot `
    "DB\build\liquibase"

New-Item `
    -ItemType Directory `
    -Path $OutputDirectory `
    -Force `
    | Out-Null

$OutputFile = Join-Path `
    $OutputDirectory `
    "update-$Environment.sql"

if (Test-Path $OutputFile) {
    Remove-Item `
        $OutputFile `
        -Force
}

# ------------------------------------------------------------
# Display configuration
# ------------------------------------------------------------

Write-Host ""
Write-Host "=============================================================="
Write-Host " Memgine Liquibase SQL Preview"
Write-Host "=============================================================="
Write-Host "Environment      : $Environment"
Write-Host "Properties       : $PropertiesFile"
Write-Host "Master changelog : $MasterChangelog"
Write-Host "Output           : $OutputFile"
Write-Host ""

# ------------------------------------------------------------
# Run Liquibase
#
# DB/build.gradle.kts is responsible for resolving:
#
#   DB/env/<environment>/liquibase.<environment>.properties
#   DB/env/<environment>/db.changelog-master.<environment>.yaml
#
# The environment is passed as a simple Gradle property.
#
# updateSql generates SQL only.
# It DOES NOT modify the database.
# ------------------------------------------------------------

Write-Host "Generating SQL preview..."
Write-Host ""

& $GradleWrapper `
    :DB:updateSql `
    "-PdbEnvironment=$Environment" `
    "-PliquibaseOutputFile=$OutputFile"

if ($LASTEXITCODE -ne 0) {
    throw "Liquibase updateSql failed with exit code $LASTEXITCODE."
}

# ------------------------------------------------------------
# Verify output
# ------------------------------------------------------------

if (-not (Test-Path $OutputFile)) {
    throw "Liquibase completed but did not create: $OutputFile"
}

$OutputInfo = Get-Item $OutputFile

Write-Host ""
Write-Host "=============================================================="
Write-Host " Liquibase SQL Preview Complete"
Write-Host "=============================================================="
Write-Host "Environment : $Environment"
Write-Host "Output      : $OutputFile"
Write-Host "Size        : $($OutputInfo.Length) bytes"
Write-Host ""
Write-Host "The database was NOT modified."
Write-Host ""