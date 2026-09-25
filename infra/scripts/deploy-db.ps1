[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [Parameter(Mandatory = $true)]
    [string]$LiquibaseSecretArn,

    [string]$AwsProfile,

    [string]$AwsRegion = "ca-central-1",

    [string]$DatabaseHost,

    [int]$DatabasePort
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$LiquibaseScript = Join-Path $RepoRoot "DB\scripts\liquibase-update.ps1"

if ([string]::IsNullOrWhiteSpace($AwsProfile)) {
    if ($Environment -eq "dev") {
        $AwsProfile = "memgine"
    }
    else {
        $AwsProfile = $env:MEMGINE_PROD_AWS_PROFILE
    }
}

if ([string]::IsNullOrWhiteSpace($AwsProfile)) {
    throw "Specify -AwsProfile or set MEMGINE_PROD_AWS_PROFILE for PROD."
}

if (-not (Test-Path $LiquibaseScript)) {
    throw "Memgine Liquibase deployment script was not found: $LiquibaseScript"
}

$secretJson = & aws --profile $AwsProfile --region $AwsRegion --no-cli-pager `
    secretsmanager get-secret-value `
    --secret-id $LiquibaseSecretArn `
    --query SecretString `
    --output text

if ($LASTEXITCODE -ne 0) {
    throw "Unable to read the Liquibase database secret."
}

$secret = $secretJson | ConvertFrom-Json
foreach ($requiredField in @("username", "password", "host", "port", "database", "schema")) {
    if ([string]::IsNullOrWhiteSpace([string]$secret.$requiredField)) {
        throw "The Liquibase database secret is missing required field '$requiredField'."
    }
}

$expectedDatabaseIdentity = @{
    dev = @{
        Username = "memgine_dev_user"
        Database = "memgine_dev"
        Schema   = "memginedev"
    }
    prod = @{
        Username = "memgine_prod_user"
        Database = "memgine_prod"
        Schema   = "memgineprod"
    }
}[$Environment]

foreach ($field in @("Username", "Database", "Schema")) {
    $actualValue = [string]$secret.($field.ToLowerInvariant())
    if ($actualValue -cne $expectedDatabaseIdentity[$field]) {
        throw "The Liquibase secret does not match the expected $Environment database identity."
    }
}

$previousLiquibaseUrl = $env:LIQUIBASE_URL
$previousLiquibaseUsername = $env:LIQUIBASE_USERNAME
$previousLiquibasePassword = $env:LIQUIBASE_PASSWORD
$connectionHost = if ([string]::IsNullOrWhiteSpace($DatabaseHost)) { [string]$secret.host } else { $DatabaseHost }
$connectionPort = if ($DatabasePort -gt 0) { $DatabasePort } else { [int]$secret.port }
$env:LIQUIBASE_URL = "jdbc:postgresql://${connectionHost}:${connectionPort}/$($secret.database)"
$env:LIQUIBASE_USERNAME = [string]$secret.username
$env:LIQUIBASE_PASSWORD = [string]$secret.password

Push-Location $RepoRoot
try {
    & $LiquibaseScript -Environment $Environment
}
finally {
    if ($null -eq $previousLiquibaseUrl) { Remove-Item Env:LIQUIBASE_URL -ErrorAction SilentlyContinue } else { $env:LIQUIBASE_URL = $previousLiquibaseUrl }
    if ($null -eq $previousLiquibaseUsername) { Remove-Item Env:LIQUIBASE_USERNAME -ErrorAction SilentlyContinue } else { $env:LIQUIBASE_USERNAME = $previousLiquibaseUsername }
    if ($null -eq $previousLiquibasePassword) { Remove-Item Env:LIQUIBASE_PASSWORD -ErrorAction SilentlyContinue } else { $env:LIQUIBASE_PASSWORD = $previousLiquibasePassword }
    Pop-Location
}
