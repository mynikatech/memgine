[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [string]$ReleaseId,

    [string]$AwsProfile = "memgine"
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$EnvDir = Join-Path $RepoRoot "infra\envs\$Environment"
. (Join-Path $PSScriptRoot "common\windows\ssm.ps1")

function Terraform-Output([string]$Name) {
    $value = & terraform "-chdir=$EnvDir" output -raw $Name
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) { throw "Unable to resolve Terraform output '$Name'." }
    return $value.Trim()
}

if ([string]::IsNullOrWhiteSpace($ReleaseId)) {
    & (Join-Path $PSScriptRoot "build-backend.ps1") -Environment $Environment
    if ($LASTEXITCODE -ne 0) { throw "Backend build failed." }

    & (Join-Path $PSScriptRoot "build-frontend.ps1") -Environment $Environment
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }

    $publishOutput = & (Join-Path $PSScriptRoot "publish-release.ps1") -Environment $Environment -AwsProfile $AwsProfile
    if ($LASTEXITCODE -ne 0) { throw "Release publish failed." }

    $ReleaseId = [string]($publishOutput | Select-Object -Last 1)
}

if ([string]::IsNullOrWhiteSpace($ReleaseId)) {
    throw "Release ID is missing."
}

$instanceId = Terraform-Output "app_ec2_instance_id"
$status = & aws --profile $AwsProfile --no-cli-pager ssm describe-instance-information --filters "Key=InstanceIds,Values=$instanceId" --query "InstanceInformationList[0].PingStatus" --output text
if ($LASTEXITCODE -ne 0 -or $status -ne "Online") { throw "Target EC2 instance is not SSM-online." }

& (Join-Path $PSScriptRoot "remote-maintenance.ps1") -Environment $Environment -Action sync-scripts -AwsProfile $AwsProfile
if (-not $?) { throw "Deployment script synchronization failed." }

$command = "/opt/memgine/scripts/common/deployment/linux/deploy-remote.sh $Environment $ReleaseId"
$commandId = Send-MemgineSsmCommand $AwsProfile $instanceId $command
$result = Wait-MemgineSsmCommand $AwsProfile $commandId $instanceId -TimeoutSeconds 900
Write-Output $result.StandardOutputContent
if ($result.StandardErrorContent) { Write-Output $result.StandardErrorContent }
