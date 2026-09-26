param([Parameter(Mandatory=$true)][ValidateSet('dev','prod')][string]$Environment)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
& (Join-Path $root 'gradlew.bat') :server:shadowJar
if($LASTEXITCODE -ne 0){throw 'Backend JAR build failed.'}
if(-not (Test-Path (Join-Path $root 'server\build\libs\memgine-server.jar'))){throw 'Expected backend JAR was not produced.'}
