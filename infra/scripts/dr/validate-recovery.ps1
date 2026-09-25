[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [Parameter(Mandatory = $true)]
    [string]$InstanceId,

    [Parameter(Mandatory = $true)]
    [string]$DbInstanceIdentifier,

    [Parameter(Mandatory = $true)]
    [string]$DeployBucket,

    [Parameter(Mandatory = $true)]
    [string]$AppDataBucket,

    [Parameter(Mandatory = $true)]
    [uri]$WebUrl,

    [Parameter(Mandatory = $true)]
    [uri]$ApiHealthUrl,

    [string]$AwsProfile,

    [string]$AwsRegion = "ca-central-1",

    [string]$DatabaseHost,

    [int]$DatabasePort
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

$ssmStatus = & aws --profile $AwsProfile --region $AwsRegion --no-cli-pager `
    ssm describe-instance-information `
    --filters "Key=InstanceIds,Values=$InstanceId" `
    --query "InstanceInformationList[0].PingStatus" `
    --output text
if ($LASTEXITCODE -ne 0 -or $ssmStatus -ne "Online") {
    throw "EC2 is not SSM-online."
}

$rdsStatus = & aws --profile $AwsProfile --region $AwsRegion --no-cli-pager `
    rds describe-db-instances `
    --db-instance-identifier $DbInstanceIdentifier `
    --query "DBInstances[0].DBInstanceStatus" `
    --output text
if ($LASTEXITCODE -ne 0 -or $rdsStatus -ne "available") {
    throw "RDS instance is not available."
}

& aws --profile $AwsProfile --region $AwsRegion --no-cli-pager s3api head-bucket --bucket $DeployBucket
if ($LASTEXITCODE -ne 0) { throw "Deployment bucket is not accessible." }
& aws --profile $AwsProfile --region $AwsRegion --no-cli-pager s3api head-bucket --bucket $AppDataBucket
if ($LASTEXITCODE -ne 0) { throw "Application data bucket is not accessible." }

Invoke-WebRequest -UseBasicParsing -Uri $ApiHealthUrl -Method Get | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri $WebUrl -Method Get | Out-Null

if (-not [string]::IsNullOrWhiteSpace($DatabaseHost)) {
    if ($DatabasePort -le 0) {
        throw "-DatabasePort is required when -DatabaseHost is supplied."
    }

    if (-not (Test-NetConnection -ComputerName $DatabaseHost -Port $DatabasePort -InformationLevel Quiet)) {
        throw "The requested database TCP endpoint is not reachable."
    }
}

Write-Host "Memgine $Environment recovery validation passed."
