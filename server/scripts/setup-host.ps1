[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [switch]$CheckOnly,

    [string]$AwsProfile = "memgine"
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$EnvDir = Join-Path $RepoRoot "infra\envs\$Environment"
. (Join-Path $PSScriptRoot "common\windows\ssm.ps1")

function Get-TerraformOutput([string]$Name) {
    $value = & terraform "-chdir=$EnvDir" output -raw $Name
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
        throw "Unable to resolve Terraform output '$Name'."
    }
    return $value.Trim()
}

function Get-OptionalTerraformOutput([string]$Name) {
    $value = & terraform "-chdir=$EnvDir" output -raw $Name 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return $value.Trim()
}
function ConvertTo-BashSingleQuoted([string]$Value) {
    return "'" + $Value.Replace("'", "'""'""'") + "'"
}

function Invoke-HostSsmCommand([string]$InstanceId, [string]$Command) {
    $commandId = Send-MemgineSsmCommand $AwsProfile $InstanceId $Command
    $result = Wait-MemgineSsmCommand $AwsProfile $commandId $InstanceId -TimeoutSeconds 1200
    Write-Output $result.StandardOutputContent
    if ($result.StandardErrorContent) { Write-Output $result.StandardErrorContent }
}

$instanceId = Get-TerraformOutput "app_ec2_instance_id"
$deployBucket = Get-TerraformOutput "app_deploy_bucket"
$runtimeDbSecretArn = Get-TerraformOutput "app_database_runtime_secret_arn"
$otpPepperSecretArn = Get-TerraformOutput "app_otp_pepper_secret_arn"
$elasticIp = Get-TerraformOutput "app_elastic_ip"
$notificationTopicArn = Get-OptionalTerraformOutput "notification_topic_arn"

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

$onlineStatus = & aws --profile $AwsProfile --no-cli-pager ssm describe-instance-information `
    --filters "Key=InstanceIds,Values=$instanceId" `
    --query "InstanceInformationList[0].PingStatus" `
    --output text
if ($LASTEXITCODE -ne 0 -or $onlineStatus -ne "Online") {
    throw "Target EC2 instance is not SSM-online."
}

if (-not $CheckOnly) {
    & (Join-Path $PSScriptRoot "publish-scripts.ps1") `
        -Environment $Environment `
        -AwsProfile $AwsProfile
    if (-not $?) { throw "Host setup script publication failed." }

    & (Join-Path $PSScriptRoot "remote-maintenance.ps1") `
        -Environment $Environment `
        -Action sync-scripts `
        -AwsProfile $AwsProfile
    if (-not $?) { throw "Host setup script synchronization failed." }

    Invoke-HostSsmCommand $instanceId "test -x /opt/memgine/scripts/common/deployment/linux/setup-host.sh || { echo 'Missing executable setup-host.sh after script synchronization.' >&2; exit 1; }"
}

$arguments = @(
    (ConvertTo-BashSingleQuoted $Environment)
)
if ($CheckOnly) {
    $arguments += "--check-only"
}
else {
    $arguments += @(
        "--deploy-bucket", (ConvertTo-BashSingleQuoted $deployBucket),
        "--db-secret-arn", (ConvertTo-BashSingleQuoted $runtimeDbSecretArn),
        "--otp-pepper-secret-arn", (ConvertTo-BashSingleQuoted $otpPepperSecretArn),
        "--expected-public-ip", (ConvertTo-BashSingleQuoted $elasticIp)
    )
    if (-not [string]::IsNullOrWhiteSpace($notificationTopicArn)) {
        $arguments += @("--notification-topic-arn", (ConvertTo-BashSingleQuoted $notificationTopicArn))
    }
}

$remoteScript = "/opt/memgine/scripts/common/deployment/linux/setup-host.sh"
$command = "$remoteScript $($arguments -join ' ')"
Invoke-HostSsmCommand $instanceId $command
