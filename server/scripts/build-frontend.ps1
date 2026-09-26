[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev','prod')]
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

Copy-Item $envFile (Join-Path $frontend '.env') -Force

Push-Location $frontend
try {
    & npx expo export --platform web --output-dir $OutputDirectory

    if ($LASTEXITCODE -ne 0) {
        throw 'Frontend web export failed.'
    }
}
finally {
    Pop-Location
    Remove-Item (Join-Path $frontend '.env') -Force -ErrorAction SilentlyContinue
}