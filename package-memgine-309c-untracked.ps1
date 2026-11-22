# Package all untracked files in the current Memgine repository for review.
$ErrorActionPreference = 'Stop'

$repo = 'D:\MynikaTech\memgine'
$zip = Join-Path $env:TEMP 'memgine-309c-untracked.zip'
$stage = Join-Path $env:TEMP 'memgine-309c-untracked'

if (-not (Test-Path -LiteralPath $repo -PathType Container)) {
    throw "Repository directory not found: $repo"
}
Set-Location -LiteralPath $repo

if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$files = @(git ls-files --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw 'Could not list untracked Git files.' }
if ($files.Count -eq 0) { throw 'No untracked files found. Nothing to package.' }

foreach ($file in $files) {
    $relative = $file.Replace('/', [IO.Path]::DirectorySeparatorChar)
    $src = Join-Path $repo $relative
    $dst = Join-Path $stage $relative
    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) {
        throw "Untracked file not found: $file"
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
    Copy-Item -LiteralPath $src -Destination $dst -Force
}

if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "Packaged $($files.Count) untracked files."
Write-Host "ZIP created: $zip"
