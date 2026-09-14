# Memgine Local PostgreSQL DEV RESET
#
# PURPOSE:
#   Completely remove the local Memgine DEV database and its
#   Memgine-specific roles.
#
# IMPORTANT:
#   This script ONLY DESTROYS the local Memgine environment.
#   It DOES NOT recreate the database, roles, schema, permissions,
#   or run Liquibase.
#
#   Recreation is handled separately by:
#
#       DB\env\local\bootstrap-local-memgine.ps1
#
# TARGET:
#   Database : memgine_dev
#   Schema   : memginedev
#   App role : memgine_app_dev
#   Deploy   : memgine_dev_user
#
# SAFETY:
#   - Connects to the PostgreSQL maintenance database "postgres".
#   - Terminates connections to memgine_dev before dropping it.
#   - Drops ONLY the Memgine local DEV database and roles.
#   - Does NOT touch ApnaFund or any other database/role.
#   - Requires explicit confirmation.
#   - Requests the postgres password only once.
#   - Password is kept only in the current PowerShell process.
#
# USAGE:
#
#   From the Memgine repository root:
#
#       .\DB\scripts\reset-local-memgine.ps1
#
#   If PowerShell execution policy blocks the script, run:
#
#       powershell.exe -ExecutionPolicy Bypass -File ".\DB\scripts\reset-local-memgine.ps1"
#
# AFTER RESET:
#
#   Run the separate local environment bootstrap:
#
#       .\DB\env\local\bootstrap-local-memgine.ps1
#
#   Then verify the database/schema/roles before running Liquibase.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Memgine local environment
# ---------------------------------------------------------------------------

$DatabaseName = "memgine_dev"
$AppRole      = "memgine_app_dev"
$DeployRole   = "memgine_dev_user"

$PgHost        = "127.0.0.1"
$PgPort        = 5432
$MaintenanceDb = "postgres"

# ---------------------------------------------------------------------------
# Locate PostgreSQL client
# ---------------------------------------------------------------------------

$PsqlCandidates = @(
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
)

$Psql = $null

foreach ($Candidate in $PsqlCandidates) {
    if (Test-Path $Candidate) {
        $Psql = $Candidate
        break
    }
}

if (-not $Psql) {
    $PsqlCommand = Get-Command psql.exe -ErrorAction SilentlyContinue

    if ($PsqlCommand) {
        $Psql = $PsqlCommand.Source
    }
}

if (-not $Psql) {
    throw @"
PostgreSQL psql.exe was not found.

Expected PostgreSQL 17 location:
  C:\Program Files\PostgreSQL\17\bin\psql.exe

Make sure PostgreSQL 17 is installed and try again.
"@
}

# ---------------------------------------------------------------------------
# Display target
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "=============================================================="
Write-Host " Memgine LOCAL PostgreSQL DEV RESET"
Write-Host "=============================================================="
Write-Host ""
Write-Host "This operation will PERMANENTLY DELETE:"
Write-Host ""
Write-Host "  Database : $DatabaseName"
Write-Host "  Role     : $DeployRole"
Write-Host "  Role     : $AppRole"
Write-Host ""
Write-Host "The database contains the Memgine schema:"
Write-Host "  memginedev"
Write-Host ""
Write-Host "The following will NOT be touched:"
Write-Host ""
Write-Host "  - ApnaFund databases"
Write-Host "  - ApnaFund roles"
Write-Host "  - PostgreSQL system databases"
Write-Host "  - Any other database"
Write-Host "  - Any other PostgreSQL role"
Write-Host ""
Write-Host "IMPORTANT:"
Write-Host "  This script will NOT recreate anything."
Write-Host "  It will NOT run Liquibase."
Write-Host ""
Write-Host "The postgres password will be requested only once."
Write-Host ""

$Confirmation = Read-Host "Type RESET-MEMGINE-LOCAL to continue"

if ($Confirmation -cne "RESET-MEMGINE-LOCAL") {
    Write-Host ""
    Write-Host "Reset cancelled. Nothing was changed."
    exit 0
}

# ---------------------------------------------------------------------------
# Request postgres password ONCE
# ---------------------------------------------------------------------------
#
# PGPASSWORD is used only by this PowerShell process.
# It is never written to a project file.
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "PostgreSQL administrator authentication"
Write-Host ""

$PostgresPassword = Read-Host "Enter postgres password"

if ([string]::IsNullOrWhiteSpace($PostgresPassword)) {
    throw "Postgres password cannot be empty."
}

$env:PGPASSWORD = $PostgresPassword

# Clear the normal PowerShell variable after assigning PGPASSWORD.
# The value remains available to child psql processes through the
# current process environment.
$PostgresPassword = $null

# ---------------------------------------------------------------------------
# Helper function
# ---------------------------------------------------------------------------
#
# All PostgreSQL commands go through this function, so they automatically
# reuse the single PGPASSWORD value set above.
# ---------------------------------------------------------------------------

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $Psql @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL command failed with exit code $LASTEXITCODE."
    }
}

# ---------------------------------------------------------------------------
# Verify PostgreSQL connectivity
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Checking PostgreSQL..."
Write-Host ""

Invoke-Psql @(
    "-h", $PgHost,
    "-p", $PgPort,
    "-U", "postgres",
    "-d", $MaintenanceDb,
    "-c", "SELECT version();"
)

# ---------------------------------------------------------------------------
# Verify target database before destructive operation
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Checking target database..."
Write-Host ""

$DatabaseExists = & $Psql `
    "-h", $PgHost `
    "-p", $PgPort `
    "-U", "postgres" `
    "-d", $MaintenanceDb `
    "-t" `
    "-A" `
    "-c", "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';"

if ($LASTEXITCODE -ne 0) {
    throw "Unable to determine whether database '$DatabaseName' exists."
}

$DatabaseExists = ($DatabaseExists | Out-String).Trim()

if ($DatabaseExists -eq "1") {

    Write-Host "Database '$DatabaseName' exists."
    Write-Host "Terminating active connections..."

    Invoke-Psql @(
        "-h", $PgHost,
        "-p", $PgPort,
        "-U", "postgres",
        "-d", $MaintenanceDb,
        "-c", "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DatabaseName' AND pid <> pg_backend_pid();"
    )

    Write-Host ""
    Write-Host "Dropping database '$DatabaseName'..."

    Invoke-Psql @(
        "-h", $PgHost,
        "-p", $PgPort,
        "-U", "postgres",
        "-d", $MaintenanceDb,
        "-c", "DROP DATABASE IF EXISTS $DatabaseName;"
    )

    Write-Host "Database '$DatabaseName' dropped."
}
else {
    Write-Host "Database '$DatabaseName' does not exist. Nothing to drop."
}

# ---------------------------------------------------------------------------
# Drop Memgine deployment role
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Dropping Memgine deployment role '$DeployRole'..."

Invoke-Psql @(
    "-h", $PgHost,
    "-p", $PgPort,
    "-U", "postgres",
    "-d", $MaintenanceDb,
    "-c", "DROP ROLE IF EXISTS $DeployRole;"
)

Write-Host "Role '$DeployRole' dropped."

# ---------------------------------------------------------------------------
# Drop Memgine application role
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Dropping Memgine application role '$AppRole'..."

Invoke-Psql @(
    "-h", $PgHost,
    "-p", $PgPort,
    "-U", "postgres",
    "-d", $MaintenanceDb,
    "-c", "DROP ROLE IF EXISTS $AppRole;"
)

Write-Host "Role '$AppRole' dropped."

# ---------------------------------------------------------------------------
# Final verification
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Verifying reset..."
Write-Host ""

$RemainingDatabase = & $Psql `
    "-h", $PgHost `
    "-p", $PgPort `
    "-U", "postgres" `
    "-d", $MaintenanceDb `
    "-t" `
    "-A" `
    "-c", "SELECT COUNT(*) FROM pg_database WHERE datname = '$DatabaseName';"

if ($LASTEXITCODE -ne 0) {
    throw "Reset completed, but database verification failed."
}

$RemainingRoles = & $Psql `
    "-h", $PgHost `
    "-p", $PgPort `
    "-U", "postgres" `
    "-d", $MaintenanceDb `
    "-t" `
    "-A" `
    "-c", "SELECT COUNT(*) FROM pg_roles WHERE rolname IN ('$AppRole', '$DeployRole');"

if ($LASTEXITCODE -ne 0) {
    throw "Reset completed, but role verification failed."
}

$RemainingDatabase = ($RemainingDatabase | Out-String).Trim()
$RemainingRoles    = ($RemainingRoles | Out-String).Trim()

if ($RemainingDatabase -ne "0") {
    throw "Verification failed: database '$DatabaseName' still exists."
}

if ($RemainingRoles -ne "0") {
    throw "Verification failed: one or more Memgine roles still exist."
}

# ---------------------------------------------------------------------------
# Clear password from this PowerShell process
# ---------------------------------------------------------------------------

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------------
# Complete
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "=============================================================="
Write-Host " Memgine LOCAL PostgreSQL DEV RESET COMPLETE"
Write-Host "=============================================================="
Write-Host ""
Write-Host "Removed:"
Write-Host "  Database : $DatabaseName"
Write-Host "  Role     : $DeployRole"
Write-Host "  Role     : $AppRole"
Write-Host ""
Write-Host "Nothing has been recreated."
Write-Host "Liquibase has NOT been executed."
Write-Host ""
Write-Host "Next step:"
Write-Host ""
Write-Host "  .\DB\env\local\bootstrap-local-memgine.ps1"
Write-Host ""