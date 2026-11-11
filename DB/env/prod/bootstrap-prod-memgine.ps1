[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MasterSecretArn,

    [Parameter(Mandatory = $true)]
    [string]$LiquibaseSecretArn,

    [Parameter(Mandatory = $true)]
    [string]$RuntimeSecretArn,

    [Parameter(Mandatory = $true)]
    [string]$AwsProfile,

    [string]$AwsRegion = "ca-central-1",

    [string]$PsqlPath = "psql",

    [string]$DatabaseHost,

    [int]$DatabasePort,

    [System.Security.SecureString]$LiquibasePassword,

    [System.Security.SecureString]$RuntimePassword
)

$ErrorActionPreference = "Stop"
$BootstrapSql = Join-Path $PSScriptRoot "001-create-memgine-prod.sql"

function Convert-SecureStringToPlainText([System.Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Get-Password([System.Security.SecureString]$Value, [string]$Prompt) {
    if ($null -eq $Value) {
        $Value = Read-Host $Prompt -AsSecureString
    }

    return Convert-SecureStringToPlainText $Value
}

function Invoke-Aws([string[]]$Arguments) {
    $output = & aws --profile $AwsProfile --region $AwsRegion --no-cli-pager @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed."
    }

    return $output
}

if (-not (Get-Command $PsqlPath -ErrorAction SilentlyContinue)) {
    throw "psql was not found. Set -PsqlPath to the PostgreSQL client executable."
}

$liquibasePasswordText = Get-Password $LiquibasePassword "Enter memgine_user password"
$runtimePasswordText = Get-Password $RuntimePassword "Enter memgine_app_password"
$masterSecretJson = Invoke-Aws @("secretsmanager", "get-secret-value", "--secret-id", $MasterSecretArn, "--query", "SecretString", "--output", "text")
$masterSecret = $masterSecretJson | ConvertFrom-Json
$psqlHost = if ([string]::IsNullOrWhiteSpace($DatabaseHost)) { [string]$masterSecret.host } else { $DatabaseHost }
$psqlPort = if ($DatabasePort -gt 0) { $DatabasePort } else { [int]$masterSecret.port }

$previousPgPassword = $env:PGPASSWORD
$previousLiquibasePassword = $env:MEMGINE_LIQUIBASE_PASSWORD
$previousRuntimePassword = $env:MEMGINE_RUNTIME_PASSWORD

try {
    $env:PGPASSWORD = [string]$masterSecret.password
    $env:MEMGINE_LIQUIBASE_PASSWORD = $liquibasePasswordText
    $env:MEMGINE_RUNTIME_PASSWORD = $runtimePasswordText

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

    $liquibaseSecret = [ordered]@{
        username = "memgine_user"
        password = $liquibasePasswordText
        host     = $masterSecret.host
        port     = $masterSecret.port
        database = "memgine"
        schema   = "memgine"
    } | ConvertTo-Json -Compress
    $runtimeSecret = [ordered]@{
        username = "memgine_app"
        password = $runtimePasswordText
        host     = $masterSecret.host
        port     = $masterSecret.port
        database = "memgine"
        schema   = "memgine"
    } | ConvertTo-Json -Compress

    Invoke-Aws @("secretsmanager", "put-secret-value", "--secret-id", $LiquibaseSecretArn, "--secret-string", $liquibaseSecret) | Out-Null
    Invoke-Aws @("secretsmanager", "put-secret-value", "--secret-id", $RuntimeSecretArn, "--secret-string", $runtimeSecret) | Out-Null
}
finally {
    if ($null -eq $previousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previousPgPassword }
    if ($null -eq $previousLiquibasePassword) { Remove-Item Env:MEMGINE_LIQUIBASE_PASSWORD -ErrorAction SilentlyContinue } else { $env:MEMGINE_LIQUIBASE_PASSWORD = $previousLiquibasePassword }
    if ($null -eq $previousRuntimePassword) { Remove-Item Env:MEMGINE_RUNTIME_PASSWORD -ErrorAction SilentlyContinue } else { $env:MEMGINE_RUNTIME_PASSWORD = $previousRuntimePassword }
    $liquibasePasswordText = $null
    $runtimePasswordText = $null
}

Write-Host "Memgine PROD database bootstrap completed."
