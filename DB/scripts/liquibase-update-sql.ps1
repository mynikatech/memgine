# Memgine Liquibase SQL Preview
#
# Generates the SQL Liquibase WOULD execute.
# This script DOES NOT modify the database.
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

$OutputDirectory = Join-Path $RepoRoot "DB\build\liquibase"

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$OutputFile = Join-Path $OutputDirectory "update-$Environment.sql"

if (Test-Path $OutputFile) {
    Remove-Item $OutputFile -Force
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " Memgine Liquibase SQL Preview"
Write-Host "=============================================================="
Write-Host "Environment      : $Environment"
Write-Host "Properties       : $PropertiesFile"
Write-Host "Master changelog : $MasterChangelog"
Write-Host "Output           : $OutputFile"
Write-Host ""

try {
    Set-MemgineLiquibaseEnvironment `
        -Environment $Environment `
        -AwsProfile $AwsProfile `
        -AwsRegion $AwsRegion `
        -DatabaseHost $DatabaseHost `
        -DatabasePort $DatabasePort

    Write-Host "Generating SQL preview..."
    Write-Host ""

    & $GradleWrapper `
        :DB:updateSql `
        "-PdbEnvironment=$Environment" `
        "-PliquibaseOutputFile=$OutputFile"

    if ($LASTEXITCODE -ne 0) {
        throw "Liquibase updateSql failed with exit code $LASTEXITCODE."
    }

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
}
finally {
    Clear-MemgineLiquibaseEnvironment
}