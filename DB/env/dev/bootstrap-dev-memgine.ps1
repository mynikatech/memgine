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

$BootstrapSql = Join-Path $PSScriptRoot "001-create-memgine-dev.sql"

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

    $output = & aws @profileArguments --region $AwsRegion --no-cli-pager @Arguments

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
        [System.IO.File]::WriteAllText($tempFile, $requestJson, $utf8NoBom)

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
        throw "Secret '$SecretArn' contains unexpected username '$($secret.username)'."
    }

    if ([string]::IsNullOrWhiteSpace([string]$secret.password)) {
        throw "Secret '$SecretArn' contains an empty password."
    }

    if ([string]$secret.database -ne "memgine_dev") {
        throw "Secret '$SecretArn' contains unexpected database '$($secret.database)'."
    }

    if ([string]$secret.schema -ne "memginedev") {
        throw "Secret '$SecretArn' contains unexpected schema '$($secret.schema)'."
    }
}

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
Write-Host " Memgine DEV PostgreSQL Bootstrap"
Write-Host "=============================================================="
Write-Host ""

$liquibasePasswordText = Get-Password `
    -Value $LiquibasePassword `
    -Prompt "Enter memgine_dev_user password"

$runtimePasswordText = Get-Password `
    -Value $RuntimePassword `
    -Prompt "Enter memgine_app_dev password"

$masterSecret = Get-SecretObject $MasterSecretArn

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

try {
    # Master credential is only used for the bootstrap connection.
    $env:PGPASSWORD = [string]$masterSecret.password

    # Supply role passwords through environment variables rather than
    # exposing them in the psql command line.
    $env:MEMGINE_LIQUIBASE_PASSWORD = $liquibasePasswordText
    $env:MEMGINE_RUNTIME_PASSWORD = $runtimePasswordText

    Write-Host ""
    Write-Host "Running DEV database bootstrap..."
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
        throw "Memgine DEV database bootstrap failed."
    }

    Write-Host ""
    Write-Host "Writing Liquibase and runtime credentials to AWS Secrets Manager..."

    $liquibaseSecret = [ordered]@{
        username = "memgine_dev_user"
        password = $liquibasePasswordText
        host     = [string]$masterSecret.host
        port     = [int]$masterSecret.port
        database = "memgine_dev"
        schema   = "memginedev"
    }

    $runtimeSecret = [ordered]@{
        username = "memgine_app_dev"
        password = $runtimePasswordText
        host     = [string]$masterSecret.host
        port     = [int]$masterSecret.port
        database = "memgine_dev"
        schema   = "memginedev"
    }

    Write-SecretJson `
        -SecretArn $LiquibaseSecretArn `
        -SecretObject $liquibaseSecret

    Write-SecretJson `
        -SecretArn $RuntimeSecretArn `
        -SecretObject $runtimeSecret

    Write-Host "Validating Secrets Manager values..."

    Assert-DatabaseSecret `
        -SecretArn $LiquibaseSecretArn `
        -ExpectedUsername "memgine_dev_user"

    Assert-DatabaseSecret `
        -SecretArn $RuntimeSecretArn `
        -ExpectedUsername "memgine_app_dev"

    Write-Host ""
    Write-Host "=============================================================="
    Write-Host " Memgine DEV database bootstrap completed successfully."
    Write-Host "=============================================================="
    Write-Host ""
    Write-Host "Database       : memgine_dev"
    Write-Host "Schema         : memginedev"
    Write-Host "Liquibase role : memgine_dev_user"
    Write-Host "Runtime role   : memgine_app_dev"
    Write-Host ""
    Write-Host "Both DB secrets were written and validated as JSON."
    Write-Host ""
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:MEMGINE_LIQUIBASE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:MEMGINE_RUNTIME_PASSWORD -ErrorAction SilentlyContinue

    $liquibasePasswordText = $null
    $runtimePasswordText = $null
    $masterSecret = $null
}