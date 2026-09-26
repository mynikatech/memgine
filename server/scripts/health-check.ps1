param([Parameter(Mandatory=$true)][ValidateSet('dev','prod')][string]$Environment,[string]$AwsProfile='memgine')
$ErrorActionPreference='Stop'; $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')); $envDir=Join-Path $root "infra\envs\$Environment"
. (Join-Path $PSScriptRoot 'common\windows\ssm.ps1')
$id=(& terraform "-chdir=$envDir" output -raw app_ec2_instance_id).Trim(); if($LASTEXITCODE -ne 0){throw 'Unable to resolve EC2 instance.'}
$cid=Send-MemgineSsmCommand $AwsProfile $id "/opt/memgine/scripts/health-check.sh $Environment"
$r=Wait-MemgineSsmCommand $AwsProfile $cid $id -TimeoutSeconds 120; Write-Output $r.StandardOutputContent; if($r.StandardErrorContent){Write-Output $r.StandardErrorContent}
