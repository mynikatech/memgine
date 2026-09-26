[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$frontend = Join-Path $root 'frontend'
$envFile = Join-Path $PSScriptRoot "env\$Environment\https\frontend.env"

if (-not (Test-Path $envFile)) {
    $envFileExample = "$envFile.example"

    if (-not (Test-Path $envFileExample)) {
        throw "Frontend environment file and example are both missing: $envFile"
    }

    Copy-Item $envFileExample $envFile
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $frontend 'dist-web'
}

if (Test-Path $OutputDirectory) {
    Remove-Item $OutputDirectory -Recurse -Force
}

# ---------------------------------------------------------------------------
# Preserve the caller's existing EXPO_PUBLIC_* environment variables.
#
# Local development may intentionally have values such as:
#   https://api.memgine.local
#   http://localhost:8082
#
# Those values must never leak into a DEV/PROD deployment build.
# ---------------------------------------------------------------------------

$originalExpoVariables = @{}

Get-ChildItem Env: |
    Where-Object { $_.Name -like 'EXPO_PUBLIC_*' } |
    ForEach-Object {
        $originalExpoVariables[$_.Name] = $_.Value
    }

$hadExpoNoDotenv = Test-Path Env:EXPO_NO_DOTENV
$originalExpoNoDotenv = $env:EXPO_NO_DOTENV

try {
    # -----------------------------------------------------------------------
    # Remove all existing EXPO_PUBLIC_* process variables first.
    # The selected environment file below becomes the only source of
    # EXPO_PUBLIC_* configuration for this deployment build.
    # -----------------------------------------------------------------------

    Get-ChildItem Env: |
        Where-Object { $_.Name -like 'EXPO_PUBLIC_*' } |
        ForEach-Object {
            Remove-Item "Env:$($_.Name)" -ErrorAction SilentlyContinue
        }

    # -----------------------------------------------------------------------
    # Prevent Expo from loading frontend/.env, frontend/.env.local, etc.
    #
    # Deployment builds must use:
    #
    # server/scripts/env/<environment>/https/frontend.env
    #
    # and nothing from the developer's local dotenv files.
    # -----------------------------------------------------------------------

    $env:EXPO_NO_DOTENV = '1'

    # -----------------------------------------------------------------------
    # Load the selected DEV/PROD frontend environment explicitly into the
    # current process.
    # -----------------------------------------------------------------------

    foreach ($rawLine in Get-Content $envFile) {
        $line = $rawLine.Trim()

        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        if ($line.StartsWith('#')) {
            continue
        }

        $parts = $line -split '=', 2

        if ($parts.Count -ne 2) {
            throw "Invalid frontend environment line: $line"
        }

        $name = $parts[0].Trim()
        $value = $parts[1].Trim()

        if (-not $name.StartsWith('EXPO_PUBLIC_')) {
            throw "Unexpected frontend environment variable in ${envFile}: $name"
        }

        if ([string]::IsNullOrWhiteSpace($name)) {
            throw "Frontend environment variable name cannot be empty."
        }

        [Environment]::SetEnvironmentVariable(
            $name,
            $value,
            'Process'
        )
    }

    # -----------------------------------------------------------------------
    # Validate the values required by the frontend HTTP client.
    # -----------------------------------------------------------------------

    $webApiUrl = $env:EXPO_PUBLIC_MEMGINE_API_BASE_URL_WEB

    if ([string]::IsNullOrWhiteSpace($webApiUrl)) {
        $webApiUrl = $env:EXPO_PUBLIC_API_BASE_URL
    }

    if ([string]::IsNullOrWhiteSpace($webApiUrl)) {
        throw "Frontend API URL is not configured for environment '$Environment'."
    }

    Write-Host ""
    Write-Host "Frontend build environment: $Environment"
    Write-Host "Frontend API URL          : $env:EXPO_PUBLIC_API_BASE_URL"
    Write-Host "Frontend Web API URL      : $env:EXPO_PUBLIC_MEMGINE_API_BASE_URL_WEB"
    Write-Host "Frontend Native API URL   : $env:EXPO_PUBLIC_MEMGINE_API_BASE_URL_NATIVE"
    Write-Host "Frontend output directory : $OutputDirectory"
    Write-Host ""

    # -----------------------------------------------------------------------
    # Build.
    #
    # --clear is deliberate. Environment variables are embedded into the
    # generated web JavaScript bundle, so Metro must not reuse a transform
    # produced with another environment.
    # -----------------------------------------------------------------------

    Push-Location $frontend

    try {
        & npx expo export `
            --platform web `
            --output-dir $OutputDirectory `
            --clear

        if ($LASTEXITCODE -ne 0) {
            throw "Frontend web export failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    # -----------------------------------------------------------------------
    # Validate generated output.
    # -----------------------------------------------------------------------

    $bundleDirectory = Join-Path $OutputDirectory '_expo\static\js\web'

    if (-not (Test-Path $bundleDirectory)) {
        throw "Frontend web bundle directory was not produced: $bundleDirectory"
    }

    $bundleFiles = @(
        Get-ChildItem $bundleDirectory -Filter '*.js' -File
    )

    if ($bundleFiles.Count -eq 0) {
        throw "No frontend JavaScript bundle was produced in: $bundleDirectory"
    }

    if (-not (Test-Path (Join-Path $OutputDirectory 'index.html'))) {
        throw "Frontend index.html was not produced in: $OutputDirectory"
    }

    $expectedApiFound = $false
    $forbiddenApiMatches = New-Object System.Collections.Generic.List[string]

    foreach ($bundle in $bundleFiles) {
        $bundleContent = Get-Content $bundle.FullName -Raw

        if ($bundleContent.Contains($webApiUrl)) {
            $expectedApiFound = $true
        }

        # These must never appear in a remotely deployed DEV/PROD web bundle.
        $forbiddenValues = @(
            'https://api.memgine.local',
            'http://api.memgine.local',
            'http://localhost:8082',
            'https://localhost:8082',
            'http://127.0.0.1:8082',
            'https://127.0.0.1:8082'
        )

        foreach ($forbiddenValue in $forbiddenValues) {
            if ($bundleContent.Contains($forbiddenValue)) {
                $forbiddenApiMatches.Add(
                    "$($bundle.Name): $forbiddenValue"
                )
            }
        }
    }

    if (-not $expectedApiFound) {
        throw "Expected API URL was not found in generated frontend bundle: $webApiUrl"
    }

    if ($forbiddenApiMatches.Count -gt 0) {
        $message = $forbiddenApiMatches -join [Environment]::NewLine

        throw @"
Frontend bundle contains forbidden local API configuration:

$message
"@
    }

    Write-Host ""
    Write-Host "Frontend bundle API verification passed."
    Write-Host "Expected web API: $webApiUrl"
    Write-Host ""
    Write-Host "Exported: $OutputDirectory"
}
finally {
    # -----------------------------------------------------------------------
    # Restore the PowerShell process exactly as it was before this script.
    # This means local development configuration is not destroyed by running
    # a DEV or PROD deployment build.
    # -----------------------------------------------------------------------

    Get-ChildItem Env: |
        Where-Object { $_.Name -like 'EXPO_PUBLIC_*' } |
        ForEach-Object {
            Remove-Item "Env:$($_.Name)" -ErrorAction SilentlyContinue
        }

    foreach ($name in $originalExpoVariables.Keys) {
        [Environment]::SetEnvironmentVariable(
            $name,
            $originalExpoVariables[$name],
            'Process'
        )
    }

    if ($hadExpoNoDotenv) {
        $env:EXPO_NO_DOTENV = $originalExpoNoDotenv
    }
    else {
        Remove-Item Env:EXPO_NO_DOTENV -ErrorAction SilentlyContinue
    }
}