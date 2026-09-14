[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$PostgresPassword,

    [Parameter(Mandatory = $false)]
    [string]$DeployPassword,

    [Parameter(Mandatory = $false)]
    [string]$AppPassword
)

$ErrorActionPreference = "Stop"

$Psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"

if (-not (Test-Path $Psql)) {
    throw "PostgreSQL 17 psql.exe not found at $Psql"
}

if (-not $PostgresPassword) {
    $secure = Read-Host "Enter postgres password" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

    try {
        $PostgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

if (-not $DeployPassword) {
    $secure = Read-Host "Enter memgine_dev_user password" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

    try {
        $DeployPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

if (-not $AppPassword) {
    $secure = Read-Host "Enter memgine_app_dev password" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

    try {
        $AppPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

$env:PGPASSWORD = $PostgresPassword

Write-Host ""
Write-Host "Creating Memgine local DEV environment..."
Write-Host ""

& $Psql `
    -h 127.0.0.1 `
    -p 5432 `
    -U postgres `
    -d postgres `
    -v ON_ERROR_STOP=1 `
    -v "deploy_password=$DeployPassword" `
    -v "app_password=$AppPassword" `
    -f ".\DB\env\local\001-create-memgine-dev.sql"

if ($LASTEXITCODE -ne 0) {
    throw "Memgine local DEV bootstrap failed."
}

Write-Host ""
Write-Host "Memgine local DEV bootstrap completed successfully."
Write-Host ""
Write-Host "Database : memgine_dev"
Write-Host "Schema   : memginedev"
Write-Host "Deploy   : memgine_dev_user"
Write-Host "Runtime  : memgine_app_dev"
Write-Host ""