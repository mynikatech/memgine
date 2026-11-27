param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,

    [string]$AwsProfile = 'memgine',
    [string]$AwsRegion = 'ca-central-1'
)

$ErrorActionPreference = 'Stop'
$expectedAccount = '482762107384'
$secretId = "/memgine/$Environment/grafana/loki"
$token = $null
$payload = $null
$tempDir = $null
$tempFile = $null

try {
    $account = & aws sts get-caller-identity --profile $AwsProfile --query Account --output text
    if ($LASTEXITCODE -ne 0 -or "$account".Trim() -ne $expectedAccount) {
        throw 'AWS account verification failed. No secret was changed.'
    }

    & aws secretsmanager describe-secret --secret-id $secretId --profile $AwsProfile --region $AwsRegion --query Name --output text
    if ($LASTEXITCODE -ne 0) { throw 'Expected Terraform-managed secret does not exist or is inaccessible.' }

    Write-Host "Target: $secretId ($AwsRegion)" -ForegroundColor Cyan
    if ((Read-Host "Type $Environment to confirm") -cne $Environment) { throw 'Cancelled.' }
    $token = Read-Host "Enter Grafana $Environment logs:write token" -AsSecureString
    if ($token.Length -eq 0) { throw 'Token must not be empty.' }

    # Restrict the temporary directory before writing any credential data.
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("memgine-grafana-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = Get-Acl -LiteralPath $tempDir
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleAll($rule) }
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $tempDir -AclObject $acl

    $tempFile = Join-Path $tempDir 'secret.json'
    $payload = @{ username = '1900151'; token = [System.Net.NetworkCredential]::new('', $token).Password } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($tempFile, $payload, [System.Text.UTF8Encoding]::new($false))

    & aws secretsmanager put-secret-value --secret-id $secretId --secret-string "file://$tempFile" --profile $AwsProfile --region $AwsRegion --query '{Name:Name,VersionId:VersionId,VersionStages:VersionStages}' --output json
    if ($LASTEXITCODE -ne 0) { throw 'Secret update failed.' }

    & aws secretsmanager describe-secret --secret-id $secretId --profile $AwsProfile --region $AwsRegion --query '{Name:Name,LastChangedDate:LastChangedDate,Versions:VersionIdsToStages}' --output json
    if ($LASTEXITCODE -ne 0) { throw 'Secret was written but metadata verification failed.' }
}
finally {
    if ($null -ne $token) { $token.Dispose() }
    $payload = $null
    if ($tempDir -and (Test-Path -LiteralPath $tempDir)) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction Stop
    }
}
