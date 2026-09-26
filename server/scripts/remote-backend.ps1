param([Parameter(Mandatory=$true)][ValidateSet('dev','prod')][string]$Environment,[Parameter(Mandatory=$true)][ValidateSet('start','stop','restart','status')][string]$Action,[string]$AwsProfile='memgine')
$ErrorActionPreference='Stop'; $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')); $envDir=Join-Path $root "infra\envs\$Environment"
. (Join-Path $PSScriptRoot 'common\windows\ssm.ps1')
$id=(& terraform "-chdir=$envDir" output -raw app_ec2_instance_id).Trim(); if($LASTEXITCODE -ne 0){throw 'Unable to resolve EC2 instance.'}
$online=& aws --profile $AwsProfile --no-cli-pager ssm describe-instance-information --filters "Key=InstanceIds,Values=$id" --query 'InstanceInformationList[0].PingStatus' --output text; if($LASTEXITCODE -ne 0 -or $online -ne 'Online'){throw 'Target EC2 is not SSM-online.'}
$command="/opt/memgine/scripts/common/backend/linux/$Action-backend.sh memgine-$Environment"
$cid=Send-MemgineSsmCommand $AwsProfile $id $command
$r=Wait-MemgineSsmCommand $AwsProfile $cid $id -TimeoutSeconds 300; Write-Output $r.StandardOutputContent; if($r.StandardErrorContent){Write-Output $r.StandardErrorContent}
