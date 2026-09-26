[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [string]$AwsProfile = "memgine"
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$EnvDir = Join-Path $RepoRoot "infra\envs\$Environment"

function Get-TerraformOutput([string]$Name) {
    $value = & terraform "-chdir=$EnvDir" output -raw $Name
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
        throw "Unable to resolve Terraform output '$Name'."
    }
    return $value.Trim()
}

$bucket = Get-TerraformOutput "app_deploy_bucket"
$runtimeDbSecretArn = Get-TerraformOutput "app_database_runtime_secret_arn"
$arnParts = $runtimeDbSecretArn -split ":"
if ($arnParts.Count -lt 6 -or [string]::IsNullOrWhiteSpace($arnParts[4])) {
    throw "Terraform returned an invalid runtime database secret ARN."
}
$expectedAccountId = $arnParts[4]

$identity = & aws sts get-caller-identity --profile $AwsProfile --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "AWS credentials for profile '$AwsProfile' are unavailable or expired."
}
$identityObject = $identity | ConvertFrom-Json
if ($identityObject.Account -ne $expectedAccountId) {
    throw "Wrong AWS account. Expected $expectedAccountId but authenticated to $($identityObject.Account)."
}

$staleEnvironments = @("local", "dev", "prod") | Where-Object { $_ -ne $Environment }

Write-Host "Target bucket: s3://$bucket"
Write-Host "Selected environment: $Environment"
Write-Host "The following stale environment prefixes are candidates for one-time removal:"
foreach ($staleEnvironment in $staleEnvironments) {
    Write-Host "  s3://$bucket/scripts/env/$staleEnvironment/"
}

foreach ($staleEnvironment in $staleEnvironments) {
    $prefix = "s3://$bucket/scripts/env/$staleEnvironment/"
    if ($PSCmdlet.ShouldProcess($prefix, "Remove stale environment deployment scripts")) {
        & aws --profile $AwsProfile --no-cli-pager s3 rm $prefix --recursive
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to remove stale prefix: $prefix"
        }
    }
}