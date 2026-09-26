[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [string]$AwsProfile = "memgine"
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$EnvDir = Join-Path $RepoRoot "infra\envs\$Environment"
$ScriptsRoot = Join-Path $RepoRoot "server\scripts"
. (Join-Path $PSScriptRoot "common\windows\ssm.ps1")

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

$identityOutput = & aws --profile $AwsProfile --no-cli-pager sts get-caller-identity --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "AWS credentials for profile '$AwsProfile' are unavailable or expired."
}
$identityJson = [string]::Join([Environment]::NewLine, [string[]]$identityOutput)
try {
    $identity = ConvertFrom-Json -InputObject $identityJson -ErrorAction Stop
}
catch {
    throw "AWS returned invalid caller identity JSON: $($_.Exception.Message)"
}
if ($identity.Account -ne $expectedAccountId) {
    throw "Wrong AWS account. Expected $expectedAccountId but authenticated to $($identity.Account)."
}

$commonSource = Join-Path $ScriptsRoot "common"
$environmentSource = Join-Path $ScriptsRoot "env\$Environment"
if (-not (Test-Path -LiteralPath $commonSource)) { throw "Common script directory is missing: $commonSource" }
if (-not (Test-Path -LiteralPath $environmentSource)) { throw "Environment script directory is missing: $environmentSource" }

# Publish shared scripts only to the shared prefix.
& aws --profile $AwsProfile --no-cli-pager s3 sync $commonSource "s3://$bucket/scripts/common/" --delete
if ($LASTEXITCODE -ne 0) { throw "Unable to publish common deployment scripts." }

# Publish only the selected environment. This script never touches another environment prefix.
& aws --profile $AwsProfile --no-cli-pager s3 sync $environmentSource "s3://$bucket/scripts/env/$Environment/" --delete `
    --exclude "https/memgine.env" `
    --exclude "https/frontend.env" `
    --exclude "https/deployment.properties" `
    --exclude "https/backend-secrets.env" `
    --exclude "https/certs/*" `
    --exclude "*.key" `
    --exclude "*.pem"
if ($LASTEXITCODE -ne 0) { throw "Unable to publish $Environment deployment scripts." }

$linuxEntryScripts = @(
    "check-certificates.sh",
    "configure-nginx.sh",
    "deploy.sh",
    "health-check.sh",
    "renew-certificates.sh",
    "rollback.sh",
    "setup-https.sh"
)

foreach ($scriptName in $linuxEntryScripts) {
    $scriptPath = Join-Path $ScriptsRoot $scriptName
    if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Required deployment script is missing: $scriptPath" }

    & aws --profile $AwsProfile --no-cli-pager s3 cp $scriptPath "s3://$bucket/scripts/$scriptName"
    if ($LASTEXITCODE -ne 0) { throw "Unable to publish deployment script: $scriptName" }
}

Write-Output "Published common and $Environment deployment scripts to s3://$bucket/scripts/."
