# Memgine Liquibase Database Update
#
# Applies pending Liquibase changesets.
#
# LOCAL:
#   Uses liquibase.local.properties.
#
# DEV / PROD:
#   Retrieves Liquibase credentials from AWS Secrets Manager.
#   Passwords are never written to a properties file.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("local", "dev", "prod")]
    [string]$Environment = "local",

    [string]$AwsProfile = "memgine",

    [string]$AwsRegion = "ca-central-1",

    [string]$DatabaseHost = "127.0.0.1",

    [int]$DatabasePort
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Get-Location).Path

$GradleWrapper = Join-Path $RepoRoot "gradlew.bat"

if (-not (Test-Path $GradleWrapper)) {
    throw "gradlew.bat was not found. Run this script from the Memgine repository root."
}

$EnvironmentDirectory = Join-Path $RepoRoot "DB\env\$Environment"
$PropertiesFile = Join-Path $EnvironmentDirectory "liquibase.$Environment.properties"
$MasterChangelog = Join-Path $EnvironmentDirectory "db.changelog-master.$Environment.yaml"

if (-not (Test-Path $PropertiesFile)) {
    throw "Liquibase properties file not found: $PropertiesFile"
}

if (-not (Test-Path $MasterChangelog)) {
    throw "Liquibase master changelog not found: $MasterChangelog"
}

$EnvironmentHelper = Join-Path $PSScriptRoot "liquibase-environment.ps1"

if (-not (Test-Path $EnvironmentHelper)) {
    throw "Liquibase environment helper not found: $EnvironmentHelper"
}

. $EnvironmentHelper

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
    Write-Host ""

    $Confirmation = Read-Host "Type APPLY-PROD to continue"

    if ($Confirmation -cne "APPLY-PROD") {
        Write-Host ""
        Write-Host "Production update cancelled."
        exit 0
    }

    Write-Host ""
}

try {
    Set-MemgineLiquibaseEnvironment `
        -Environment $Environment `
        -AwsProfile $AwsProfile `
        -AwsRegion $AwsRegion `
        -DatabaseHost $DatabaseHost `
        -DatabasePort $DatabasePort

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
}
finally {
    Clear-MemgineLiquibaseEnvironment
}