[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MasterSecretArn,

    [string]$AwsProfile = "memgine",

    [string]$AwsRegion = "ca-central-1",

    [string]$PsqlPath = "psql",

    [string]$DatabaseHost,

    [int]$DatabasePort
)

$ErrorActionPreference = "Stop"

$DatabaseName = "memgine_dev"
$LiquibaseRole = "memgine_dev_user"
$RuntimeRole = "memgine_app_dev"

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
        throw "Master secret does not contain valid JSON."
    }
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $PsqlPath @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL command failed with exit code $LASTEXITCODE."
    }
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI was not found."
}

if (-not (Get-Command $PsqlPath -ErrorAction SilentlyContinue)) {
    throw "psql was not found. Set -PsqlPath to the PostgreSQL client executable."
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " Memgine AWS DEV PostgreSQL RESET"
Write-Host "=============================================================="
Write-Host ""
Write-Host "This will PERMANENTLY delete:"
Write-Host ""
Write-Host "  Database : $DatabaseName"
Write-Host "  Role     : $LiquibaseRole"
Write-Host "  Role     : $RuntimeRole"
Write-Host ""
Write-Host "It will NOT:"
Write-Host ""
Write-Host "  - delete the RDS instance"
Write-Host "  - delete the EC2 instance"
Write-Host "  - modify Terraform"
Write-Host "  - delete S3 buckets"
Write-Host "  - modify Route53"
Write-Host "  - delete Secrets Manager containers"
Write-Host "  - run Liquibase"
Write-Host "  - recreate the database"
Write-Host ""
Write-Host "Recreation is handled separately by:"
Write-Host "  DB\env\dev\bootstrap-dev-memgine.ps1"
Write-Host ""

$confirmation = Read-Host "Type RESET-MEMGINE-DEV to continue"

if ($confirmation -cne "RESET-MEMGINE-DEV") {
    Write-Host ""
    Write-Host "Reset cancelled. Nothing was changed."
    exit 0
}

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
    $env:PGPASSWORD = [string]$masterSecret.password

    Write-Host ""
    Write-Host "Checking PostgreSQL connectivity..."

    Invoke-Psql @(
        "-h", $psqlHost,
        "-p", $psqlPort,
        "-U", $masterSecret.username,
        "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        "-c", "SELECT current_user, version();"
    )

    Write-Host ""
    Write-Host "Terminating active connections to '$DatabaseName'..."

    Invoke-Psql @(
        "-h", $psqlHost,
        "-p", $psqlPort,
        "-U", $masterSecret.username,
        "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        "-c", "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DatabaseName' AND pid <> pg_backend_pid();"
    )

    Write-Host ""
    Write-Host "Dropping database '$DatabaseName'..."

    Invoke-Psql @(
        "-h", $psqlHost,
        "-p", $psqlPort,
        "-U", $masterSecret.username,
        "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        "-c", "DROP DATABASE IF EXISTS $DatabaseName;"
    )

    Write-Host ""
    Write-Host "Removing any temporary Liquibase-role membership left by an interrupted bootstrap..."

    $membershipSql = @"
DO `$`$
DECLARE
    bootstrap_user text := current_user;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = '$LiquibaseRole'
    ) THEN
        EXECUTE format(
            'REVOKE $LiquibaseRole FROM %I',
            bootstrap_user
        );
    END IF;
END
`$`$;
"@

    Invoke-Psql @(
        "-h", $psqlHost,
        "-p", $psqlPort,
        "-U", $masterSecret.username,
        "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        "-c", $membershipSql
    )

    Write-Host ""
    Write-Host "Dropping runtime role '$RuntimeRole'..."

    Invoke-Psql @(
        "-h", $psqlHost,
        "-p", $psqlPort,
        "-U", $masterSecret.username,
        "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        "-c", "DROP ROLE IF EXISTS $RuntimeRole;"
    )

    Write-Host ""
    Write-Host "Dropping Liquibase role '$LiquibaseRole'..."

    Invoke-Psql @(
        "-h", $psqlHost,
        "-p", $psqlPort,
        "-U", $masterSecret.username,
        "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        "-c", "DROP ROLE IF EXISTS $LiquibaseRole;"
    )

    Write-Host ""
    Write-Host "Verifying reset..."

    $remainingDatabase = & $PsqlPath `
        -h $psqlHost `
        -p $psqlPort `
        -U $masterSecret.username `
        -d postgres `
        -t `
        -A `
        -c "SELECT COUNT(*) FROM pg_database WHERE datname = '$DatabaseName';"

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to verify database removal."
    }

    $remainingRoles = & $PsqlPath `
        -h $psqlHost `
        -p $psqlPort `
        -U $masterSecret.username `
        -d postgres `
        -t `
        -A `
        -c "SELECT COUNT(*) FROM pg_roles WHERE rolname IN ('$LiquibaseRole', '$RuntimeRole');"

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to verify role removal."
    }

    $remainingDatabase = ($remainingDatabase | Out-String).Trim()
    $remainingRoles = ($remainingRoles | Out-String).Trim()

    if ($remainingDatabase -ne "0") {
        throw "Reset verification failed: database '$DatabaseName' still exists."
    }

    if ($remainingRoles -ne "0") {
        throw "Reset verification failed: one or more Memgine DEV roles still exist."
    }

    Write-Host ""
    Write-Host "=============================================================="
    Write-Host " Memgine AWS DEV PostgreSQL RESET COMPLETE"
    Write-Host "=============================================================="
    Write-Host ""
    Write-Host "Removed:"
    Write-Host "  Database : $DatabaseName"
    Write-Host "  Role     : $LiquibaseRole"
    Write-Host "  Role     : $RuntimeRole"
    Write-Host ""
    Write-Host "The RDS instance and Secrets Manager containers remain intact."
    Write-Host ""
    Write-Host "Next step:"
    Write-Host "  Run bootstrap-dev-memgine.ps1"
    Write-Host ""
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $masterSecret = $null
}