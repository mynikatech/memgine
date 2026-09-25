[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [Parameter(Mandatory = $true)]
    [string]$SourceDbInstanceIdentifier,

    [Parameter(Mandatory = $true)]
    [string]$TargetDbInstanceIdentifier,

    [string]$SnapshotIdentifier,

    [switch]$UseLatestRestorableTime,

    [Parameter(Mandatory = $true)]
    [string]$DbSubnetGroupName,

    [Parameter(Mandatory = $true)]
    [string]$VpcSecurityGroupId,

    [string]$AwsProfile,

    [string]$AwsRegion = "ca-central-1",

    [Parameter(Mandatory = $true)]
    [string]$Confirmation
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AwsProfile)) {
    if ($Environment -eq "dev") {
        $AwsProfile = "memgine"
    }
    else {
        $AwsProfile = $env:MEMGINE_PROD_AWS_PROFILE
    }
}

if ([string]::IsNullOrWhiteSpace($AwsProfile)) {
    throw "Specify -AwsProfile or set MEMGINE_PROD_AWS_PROFILE for PROD."
}

if (($null -ne $SnapshotIdentifier) -eq $UseLatestRestorableTime.IsPresent) {
    throw "Specify exactly one of -SnapshotIdentifier or -UseLatestRestorableTime."
}

if ($TargetDbInstanceIdentifier -eq $SourceDbInstanceIdentifier) {
    throw "TargetDbInstanceIdentifier must name a new RDS instance."
}

$expectedConfirmation = "RESTORE-$($Environment.ToUpperInvariant())-RDS"
if ($Confirmation -cne $expectedConfirmation) {
    throw "Confirmation must be exactly $expectedConfirmation."
}

Write-Host "RDS recovery request"
Write-Host "Environment : $Environment"
Write-Host "Source      : $SourceDbInstanceIdentifier"
Write-Host "Target      : $TargetDbInstanceIdentifier"
Write-Host "Subnet group: $DbSubnetGroupName"
Write-Host "Security grp: $VpcSecurityGroupId"
Write-Host "Mode        : $(if ($UseLatestRestorableTime) { 'latest restorable time' } else { "snapshot $SnapshotIdentifier" })"
Write-Host ""
Write-Host "The source instance will not be modified, deleted, or switched."

$commonArguments = @(
    "--profile", $AwsProfile,
    "--region", $AwsRegion,
    "--no-cli-pager",
    "--target-db-instance-identifier", $TargetDbInstanceIdentifier,
    "--db-subnet-group-name", $DbSubnetGroupName,
    "--vpc-security-group-ids", $VpcSecurityGroupId,
    "--no-publicly-accessible",
    "--tags", "Key=Application,Value=memgine", "Key=Environment,Value=$Environment", "Key=Recovery,Value=true"
)

if ($UseLatestRestorableTime) {
    & aws rds restore-db-instance-to-point-in-time @commonArguments `
        --source-db-instance-identifier $SourceDbInstanceIdentifier `
        --use-latest-restorable-time `
        --output json
}
else {
    & aws rds restore-db-instance-from-db-snapshot @commonArguments `
        --db-snapshot-identifier $SnapshotIdentifier `
        --output json
}

if ($LASTEXITCODE -ne 0) {
    throw "RDS restore request failed."
}

Write-Host ""
Write-Host "Restore requested. The target is a new instance; no traffic has changed."
$endpoint = & aws --profile $AwsProfile --region $AwsRegion --no-cli-pager `
    rds describe-db-instances `
    --db-instance-identifier $TargetDbInstanceIdentifier `
    --query "DBInstances[0].Endpoint.Address" `
    --output text

if ($LASTEXITCODE -eq 0 -and $endpoint -ne "None") {
    Write-Host "Restored endpoint: $endpoint"
}
else {
    Write-Host "Restored endpoint: pending. Query it after RDS reports AVAILABLE."
}
