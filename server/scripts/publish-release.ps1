[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [string]$ReleaseId,

    [string]$FrontendOutputDirectory,

    [string]$AwsProfile = "memgine"
)

$ErrorActionPreference = "Stop"

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$EnvDir = Join-Path $RepoRoot "infra\envs\$Environment"
$Jar = Join-Path $RepoRoot "server\build\libs\memgine-server.jar"
$Frontend = Join-Path $RepoRoot "frontend"
$Scripts = Join-Path $RepoRoot "server\scripts"

function Terraform-Output([string]$Name) {
    $value = & terraform "-chdir=$EnvDir" output -raw $Name

    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
        throw "Unable to resolve Terraform output '$Name'."
    }

    return $value.Trim()
}

function Try-TerraformOutput([string]$Name) {
    $value = & terraform "-chdir=$EnvDir" output -raw $Name 2>$null

    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return $value.Trim()
}

function Assert-LastExitCode([string]$Message) {
    if ($LASTEXITCODE -ne 0) {
        throw $Message
    }
}

$identity = & aws sts get-caller-identity --profile $AwsProfile --output json 2>&1

if ($LASTEXITCODE -ne 0) {
    throw "AWS credentials for profile '$AwsProfile' are unavailable or expired."
}

if (($identity | ConvertFrom-Json).Account -ne "482762107384") {
    throw "The selected AWS profile is not the Memgine infrastructure account."
}

if ([string]::IsNullOrWhiteSpace($ReleaseId)) {
    $sha = (& git -C $RepoRoot rev-parse --short HEAD).Trim()

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to resolve the Git commit SHA."
    }

    $ReleaseId = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$sha"
}

if (-not (Test-Path $Jar)) {
    throw "Backend JAR is missing. Run build-backend.ps1 first."
}

if ([string]::IsNullOrWhiteSpace($FrontendOutputDirectory)) {
    $FrontendOutputDirectory = Join-Path $Frontend "dist-web"
}

if (-not (Test-Path $FrontendOutputDirectory)) {
    throw "Frontend web output is missing. Run build-frontend.ps1 first."
}

$webBundleDirectory = Join-Path $FrontendOutputDirectory "_expo\static\js\web"
$androidBundleDirectory = Join-Path $FrontendOutputDirectory "_expo\static\js\android"
$iosBundleDirectory = Join-Path $FrontendOutputDirectory "_expo\static\js\ios"

if (-not (Test-Path $webBundleDirectory)) {
    throw "Frontend output does not contain a web bundle: $webBundleDirectory"
}

if ((Test-Path $androidBundleDirectory) -or (Test-Path $iosBundleDirectory)) {
    throw "Frontend deployment output contains Android or iOS bundles. AWS deployment must use the web-only dist-web output."
}

$staging = Join-Path ([IO.Path]::GetTempPath()) "memgine-release-$ReleaseId"
New-Item -ItemType Directory -Path $staging -Force | Out-Null

try {
    Copy-Item $FrontendOutputDirectory (Join-Path $staging "frontend") -Recurse

    $bucket = Terraform-Output "app_deploy_bucket"
    $runtimeSecretArn = Terraform-Output "app_database_runtime_secret_arn"
    $otpPepperSecretArn = Terraform-Output "app_otp_pepper_secret_arn"

    $databaseHost = Terraform-Output "app_database_endpoint"

    $databasePortText = Terraform-Output "app_database_port"
    $databasePort = 0

    if (-not [int]::TryParse($databasePortText, [ref]$databasePort) -or $databasePort -lt 1 -or $databasePort -gt 65535) {
        throw "Terraform output 'app_database_port' is invalid: $databasePortText"
    }

    $ip = Terraform-Output "app_elastic_ip"

    $notificationTopicArn = Try-TerraformOutput "notification_topic_arn"
    $allowLiveSms = Try-TerraformOutput "otp_allow_live_sms"
    $canadaSmsOriginationIdentity = Try-TerraformOutput "otp_sms_canada_origination_identity"

    $deploymentProperties = @(
        "MEMGINE_ENVIRONMENT=$Environment",
        "MEMGINE_APP_USER=memgine",
        "MEMGINE_APP_ROOT=/opt/memgine",
        "MEMGINE_WEB_ROOT=/var/www/memgine-$Environment",
        "MEMGINE_DEPLOY_BUCKET=$bucket",
        "MEMGINE_DB_SECRET_ARN=$runtimeSecretArn",
        "MEMGINE_DB_HOST=$databaseHost",
        "MEMGINE_DB_PORT=$databasePort",
        "MEMGINE_OTP_PEPPER_SECRET_ARN=$otpPepperSecretArn",
        "MEMGINE_EXPECTED_PUBLIC_IP=$ip"
    ) -join "`n"

    if (-not [string]::IsNullOrWhiteSpace($notificationTopicArn)) {
        $deploymentProperties += "`nMEMGINE_NOTIFICATION_EVENTS_TOPIC_ARN=$notificationTopicArn"
    }

    if (-not [string]::IsNullOrWhiteSpace($allowLiveSms)) {
        $deploymentProperties += "`nMEMGINE_ALLOW_LIVE_SMS=$allowLiveSms"
    }

    if (-not [string]::IsNullOrWhiteSpace($canadaSmsOriginationIdentity)) {
        $deploymentProperties += "`nMEMGINE_OTP_AWS_ORIGINATION_IDENTITY_CA=$canadaSmsOriginationIdentity"
    }

    $deploymentFile = Join-Path $staging "deployment.properties"
    [IO.File]::WriteAllText($deploymentFile, "$deploymentProperties`n")

    $sha256 = (Get-FileHash $Jar -Algorithm SHA256).Hash.ToLowerInvariant()

    $manifest = @{
        releaseId = $ReleaseId
        environment = $Environment
        gitCommitSha = (& git -C $RepoRoot rev-parse HEAD).Trim()
        serverJarSha256 = $sha256
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Compress

    $manifestFile = Join-Path $staging "release-manifest.json"
    [IO.File]::WriteAllText($manifestFile, $manifest)

    & aws --profile $AwsProfile --no-cli-pager s3 cp $Jar "s3://$bucket/releases/$ReleaseId/server/server.jar"
    Assert-LastExitCode "Backend JAR upload failed."

    & aws --profile $AwsProfile --no-cli-pager s3 sync (Join-Path $staging "frontend") "s3://$bucket/releases/$ReleaseId/frontend/" --delete
    Assert-LastExitCode "Frontend release upload failed."

    & aws --profile $AwsProfile --no-cli-pager s3 cp $manifestFile "s3://$bucket/releases/$ReleaseId/release-manifest.json"
    Assert-LastExitCode "Release manifest upload failed."

    & (Join-Path $PSScriptRoot "publish-scripts.ps1") -Environment $Environment -AwsProfile $AwsProfile

    if (-not $?) {
        throw "Deployment script publication failed."
    }

    & aws --profile $AwsProfile --no-cli-pager s3 cp $deploymentFile "s3://$bucket/config/deployment.properties"
    Assert-LastExitCode "Deployment properties upload failed."

    & aws --profile $AwsProfile --no-cli-pager s3 cp (Join-Path $Scripts "env\$Environment\https\memgine.env.example") "s3://$bucket/config/backend.env.template"
    Assert-LastExitCode "Backend environment template upload failed."
}
finally {
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output $ReleaseId