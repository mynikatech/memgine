
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MasterSecretArn,

    [Parameter(Mandatory = $true)]
    [string]$LiquibaseSecretArn,

    [Parameter(Mandatory = $true)]
    [string]$RuntimeSecretArn,

    [string]$AwsProfile = "memgine",

    [string]$AwsRegion = "ca-central-1",

    [string]$PsqlPath = "psql",

    [string]$DatabaseHost,

    [int]$DatabasePort,

    [System.Security.SecureString]$LiquibasePassword,

    [System.Security.SecureString]$RuntimePassword
)

$ErrorActionPreference = "Stop"

$BootstrapSql = Join-Path $PSScriptRoot "001-create-memgine-prod.sql"

$ExpectedDatabase = "memgine"
$ExpectedSchema = "memgine"
$ExpectedLiquibaseUser = "memgine_user"
$ExpectedRuntimeUser = "memgine_app"

function Convert-SecureStringToPlainText {
    param(
        [Parameter(Mandatory = $true)]
        [System.Security.SecureString]$Value
    )

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)

    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Get-Password {
    param(
        [System.Security.SecureString]$Value,

        [Parameter(Mandatory = $true)]
        [string]$Prompt
    )

    if ($null -eq $Value) {
        $Value = Read-Host $Prompt -AsSecureString
    }

    return Convert-SecureStringToPlainText $Value
}

function Invoke-Aws {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $profileArguments = @()

    if (-not [string]::IsNullOrWhiteSpace($AwsProfile)) {
        $profileArguments = @("--profile", $AwsProfile)
    }

    $output = & aws @profileArguments `
        --region $AwsRegion `
        --no-cli-pager `
        @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed."
    }

    return $output
}

function Get-SecretObject {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SecretArn
    )

    $secretText = Invoke-Aws @(
        "secretsmanager",
        "get-secret-value",
        "--secret-id", $SecretArn,
        "--query", "SecretString",
        "--output", "text"
    )

    try {
        return ($secretText | Out-String).Trim() | ConvertFrom-Json
    }
    catch {
        throw "Secret '$SecretArn' does not contain valid JSON."
    }
}

function Write-SecretJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SecretArn,

        [Parameter(Mandatory = $true)]
        [object]$SecretObject
    )

    $secretJson = $SecretObject | ConvertTo-Json -Compress

    $request = [ordered]@{
        SecretId     = $SecretArn
        SecretString = $secretJson
    }

    $requestJson = $request | ConvertTo-Json -Compress

    $tempFile = [System.IO.Path]::GetTempFileName()

    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

        [System.IO.File]::WriteAllText(
            $tempFile,
            $requestJson,
            $utf8NoBom
        )

        $normalizedPath = $tempFile -replace "\\", "/"
        $fileUri = "file://$normalizedPath"

        Invoke-Aws @(
            "secretsmanager",
            "put-secret-value",
            "--cli-input-json", $fileUri
        ) | Out-Null
    }
    finally {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
}

function Assert-DatabaseSecret {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SecretArn,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedUsername
    )

    $secret = Get-SecretObject $SecretArn

    $requiredProperties = @(
        "username",
        "password",
        "host",
        "port",
        "database",
        "schema"
    )

    foreach ($property in $requiredProperties) {
        if ($null -eq $secret.PSObject.Properties[$property]) {
            throw "Secret '$SecretArn' is missing required property '$property'."
        }
    }

    if ([string]$secret.username -ne $ExpectedUsername) {
        throw "Secret '$SecretArn' contains an unexpected username."
    }

    if ([string]::IsNullOrWhiteSpace([string]$secret.password)) {
        throw "Secret '$SecretArn' contains an empty password."
    }

    if ([string]$secret.database -ne $ExpectedDatabase) {
        throw "Secret '$SecretArn' contains an unexpected database."
    }

    if ([string]$secret.schema -ne $ExpectedSchema) {
        throw "Secret '$SecretArn' contains an unexpected schema."
    }

    if ([string]::IsNullOrWhiteSpace([string]$secret.host)) {
        throw "Secret '$SecretArn' contains an empty host."
    }

    if ([string]$secret.port -notmatch '^\d+$' -or
        [int]$secret.port -ne 5432) {
        throw "Secret '$SecretArn' contains an unexpected port."
    }
}

# --------------------------------------------------------------
# Prerequisite validation
# --------------------------------------------------------------

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI was not found."
}

if (-not (Get-Command $PsqlPath -ErrorAction SilentlyContinue)) {
    throw "psql was not found. Set -PsqlPath to the PostgreSQL client executable."
}

if (-not (Test-Path $BootstrapSql)) {
    throw "Bootstrap SQL file was not found: $BootstrapSql"
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " Memgine PROD PostgreSQL Bootstrap"
Write-Host "=============================================================="
Write-Host ""

# --------------------------------------------------------------
# AWS identity validation
# --------------------------------------------------------------

$identity = Invoke-Aws @(
    "sts",
    "get-caller-identity",
    "--output", "json"
) | Out-String | ConvertFrom-Json

if ([string]$identity.Account -ne "482762107384") {
    throw "Wrong AWS account for Memgine PROD bootstrap."
}

Write-Host "AWS account verified: $($identity.Account)"
Write-Host "AWS region          : $AwsRegion"
Write-Host ""

# --------------------------------------------------------------
# Preserve existing environment variables
# --------------------------------------------------------------

$previousPgPassword = $env:PGPASSWORD
$previousLiquibasePassword = $env:MEMGINE_LIQUIBASE_PASSWORD
$previousRuntimePassword = $env:MEMGINE_RUNTIME_PASSWORD

$liquibasePasswordText = $null
$runtimePasswordText = $null
$masterSecret = $null

try {

    # ----------------------------------------------------------
    # Read passwords securely
    # ----------------------------------------------------------

    $liquibasePasswordText = Get-Password `
        -Value $LiquibasePassword `
        -Prompt "Enter memgine_user password"

    $runtimePasswordText = Get-Password `
        -Value $RuntimePassword `
        -Prompt "Enter memgine_app password"

    if ([string]::IsNullOrWhiteSpace($liquibasePasswordText)) {
        throw "Liquibase password cannot be empty."
    }

    if ([string]::IsNullOrWhiteSpace($runtimePasswordText)) {
        throw "Runtime password cannot be empty."
    }

    # ----------------------------------------------------------
    # Retrieve RDS master credentials
    # ----------------------------------------------------------

    $masterSecret = Get-SecretObject $MasterSecretArn

    if ([string]::IsNullOrWhiteSpace([string]$masterSecret.username) -or
        [string]::IsNullOrWhiteSpace([string]$masterSecret.password) -or
        [string]::IsNullOrWhiteSpace([string]$masterSecret.host)) {
        throw "RDS master secret is incomplete."
    }

    $psqlHost = if ([string]::IsNullOrWhiteSpace($DatabaseHost)) {
        [string]$masterSecret.host
    }
    else {
        $DatabaseHost
    }

    $psqlPort = if ($DatabasePort -gt 0) {
        $DatabasePort
    }
    else {
        [int]$masterSecret.port
    }

    # ----------------------------------------------------------
    # PostgreSQL bootstrap
    # ----------------------------------------------------------

    $env:PGPASSWORD = [string]$masterSecret.password

    $env:MEMGINE_LIQUIBASE_PASSWORD = $liquibasePasswordText
    $env:MEMGINE_RUNTIME_PASSWORD = $runtimePasswordText

    Write-Host ""
    Write-Host "Running PROD database bootstrap..."
    Write-Host "Host     : $psqlHost"
    Write-Host "Port     : $psqlPort"
    Write-Host "Database : postgres"
    Write-Host ""

    & $PsqlPath `
        -h $psqlHost `
        -p $psqlPort `
        -U $masterSecret.username `
        -d postgres `
        -v ON_ERROR_STOP=1 `
        -f $BootstrapSql

    if ($LASTEXITCODE -ne 0) {
        throw "Memgine PROD database bootstrap failed."
    }

    # ----------------------------------------------------------
    # Construct production database secrets
    # ----------------------------------------------------------

    Write-Host ""
    Write-Host "Writing Liquibase and runtime credentials to AWS Secrets Manager..."

    $liquibaseSecret = [ordered]@{
        username = $ExpectedLiquibaseUser
        password = $liquibasePasswordText
        host     = [string]$masterSecret.host
        port     = [int]$masterSecret.port
        database = $ExpectedDatabase
        schema   = $ExpectedSchema
    }

    $runtimeSecret = [ordered]@{
        username = $ExpectedRuntimeUser
        password = $runtimePasswordText
        host     = [string]$masterSecret.host
        port     = [int]$masterSecret.port
        database = $ExpectedDatabase
        schema   = $ExpectedSchema
    }

    # Same temporary-file Secrets Manager mechanism as DEV.

    Write-SecretJson `
        -SecretArn $LiquibaseSecretArn `
        -SecretObject $liquibaseSecret

    Write-SecretJson `
        -SecretArn $RuntimeSecretArn `
        -SecretObject $runtimeSecret

    # ----------------------------------------------------------
    # Validate persisted Secrets Manager values
    # ----------------------------------------------------------

    Write-Host "Validating Secrets Manager values..."

    Assert-DatabaseSecret `
        -SecretArn $LiquibaseSecretArn `
        -ExpectedUsername $ExpectedLiquibaseUser

    Assert-DatabaseSecret `
        -SecretArn $RuntimeSecretArn `
        -ExpectedUsername $ExpectedRuntimeUser

    Write-Host ""
    Write-Host "=============================================================="
    Write-Host " Memgine PROD database bootstrap completed successfully."
    Write-Host "=============================================================="
    Write-Host ""
    Write-Host "Database       : $ExpectedDatabase"
    Write-Host "Schema         : $ExpectedSchema"
    Write-Host "Liquibase role : $ExpectedLiquibaseUser"
    Write-Host "Runtime role   : $ExpectedRuntimeUser"
    Write-Host ""
    Write-Host "Both DB secrets were written and validated as JSON."
    Write-Host ""
}
finally {

    # Restore rather than destroy any pre-existing environment values.

    if ($null -eq $previousPgPassword) {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    else {
        $env:PGPASSWORD = $previousPgPassword
    }

    if ($null -eq $previousLiquibasePassword) {
        Remove-Item Env:MEMGINE_LIQUIBASE_PASSWORD -ErrorAction SilentlyContinue
    }
    else {
        $env:MEMGINE_LIQUIBASE_PASSWORD = $previousLiquibasePassword
    }

    if ($null -eq $previousRuntimePassword) {
        Remove-Item Env:MEMGINE_RUNTIME_PASSWORD -ErrorAction SilentlyContinue
    }
    else {
        $env:MEMGINE_RUNTIME_PASSWORD = $previousRuntimePassword
    }

    $liquibasePasswordText = $null
    $runtimePasswordText = $null
    $masterSecret = $null
}
