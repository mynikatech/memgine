param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [Parameter(Mandatory = $true, Position = 1)]
    [ValidateSet("plan", "apply")]
    [string]$Action,

    [string]$AwsProfile = "memgine",

    [string]$DnsAwsProfile = "ApnaFundAdmin"
)

$ErrorActionPreference = "Stop"

function Assert-AwsIdentity {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Profile,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedAccountId,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    $identityJson = & aws sts get-caller-identity --profile $Profile --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "AWS credentials for $Label profile '$Profile' are unavailable or expired."
    }

    try {
        $identity = $identityJson | ConvertFrom-Json
    }
    catch {
        throw "AWS credentials for $Label profile '$Profile' could not be verified."
    }

    if ($identity.Account -ne $ExpectedAccountId) {
        throw "Wrong $Label AWS account for profile '$Profile'. Expected $ExpectedAccountId but received $($identity.Account)."
    }

    return $identity
}

$ExpectedInfrastructureAccountId = "482762107384"
$ExpectedDnsAccountId = "861082243595"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvDir = Join-Path $ScriptDir "..\envs\$Environment"
$EnvDir = [System.IO.Path]::GetFullPath($EnvDir)

$BackendFile = Join-Path $EnvDir "backend.hcl"
$VarFile = Join-Path $EnvDir "$Environment.tfvars"
$PlanFile = Join-Path $EnvDir "$Environment.tfplan"

if (-not (Test-Path $EnvDir)) {
    Write-Error "Environment directory does not exist: $EnvDir"
    exit 1
}

if (-not (Test-Path $BackendFile)) {
    Write-Error "Backend configuration not found: $BackendFile"
    exit 1
}

if (-not (Test-Path $VarFile)) {
    Write-Error "Terraform variable file not found: $VarFile"
    exit 1
}

Write-Host ""
Write-Host "Memgine Terraform Deployment"
Write-Host "============================"
Write-Host "Environment : $Environment"
Write-Host "Action      : $Action"
Write-Host "Infrastructure profile : $AwsProfile"
Write-Host "DNS profile            : $DnsAwsProfile"
Write-Host "Directory   : $EnvDir"
Write-Host ""

Write-Host "Checking infrastructure AWS identity..."
$InfrastructureIdentity = Assert-AwsIdentity `
    -Profile $AwsProfile `
    -ExpectedAccountId $ExpectedInfrastructureAccountId `
    -Label "infrastructure"

Write-Host "Checking DNS AWS identity..."
$DnsIdentity = Assert-AwsIdentity `
    -Profile $DnsAwsProfile `
    -ExpectedAccountId $ExpectedDnsAccountId `
    -Label "DNS"

Write-Host "AWS identities verified."
Write-Host "Infrastructure account: $($InfrastructureIdentity.Account)"
Write-Host "DNS account           : $($DnsIdentity.Account)"
Write-Host ""

Push-Location $EnvDir

try {
    if ($Action -eq "plan") {
        Write-Host "Running terraform init..."

        terraform init "-backend-config=$BackendFile" "-backend-config=profile=$AwsProfile"

        if ($LASTEXITCODE -ne 0) {
            throw "terraform init failed."
        }

        Write-Host ""
        Write-Host "Running terraform fmt..."

        terraform fmt -recursive ..\..

        if ($LASTEXITCODE -ne 0) {
            throw "terraform fmt failed."
        }

        Write-Host ""
        Write-Host "Running terraform validate..."

        terraform validate

        if ($LASTEXITCODE -ne 0) {
            throw "terraform validate failed."
        }

        if (Test-Path $PlanFile) {
            Remove-Item $PlanFile -Force
        }

        Write-Host ""
        Write-Host "Creating saved Terraform plan..."

        terraform plan `
            "-var-file=$VarFile" `
            "-var=aws_profile=$AwsProfile" `
            "-var=dns_aws_profile=$DnsAwsProfile" `
            "-out=$PlanFile"

        if ($LASTEXITCODE -ne 0) {
            throw "terraform plan failed."
        }

        Write-Host ""
        Write-Host "========================================"
        Write-Host "Terraform plan created successfully."
        Write-Host "========================================"
        Write-Host ""
        Write-Host "Saved plan:"
        Write-Host "  $PlanFile"
        Write-Host ""
        Write-Host "Review the plan before applying."
        Write-Host ""
        Write-Host "To apply this exact plan, run:"
        Write-Host "  .\infra\scripts\deploy.ps1 $Environment apply"
        Write-Host ""
    }
    elseif ($Action -eq "apply") {
        if (-not (Test-Path $PlanFile)) {
            Write-Error "Saved Terraform plan not found: $PlanFile"
            Write-Host ""
            Write-Host "Run:"
            Write-Host "  .\infra\scripts\deploy.ps1 $Environment plan"
            exit 1
        }

        Write-Host "Applying saved Terraform plan:"
        Write-Host "  $PlanFile"
        Write-Host ""

        terraform apply $PlanFile

        if ($LASTEXITCODE -ne 0) {
            throw "terraform apply failed."
        }

        Write-Host ""
        Write-Host "========================================"
        Write-Host "Terraform deployment completed."
        Write-Host "========================================"
        Write-Host ""
        Write-Host "Terraform outputs:"

        terraform output

        if ($LASTEXITCODE -ne 0) {
            throw "terraform output failed."
        }

        if (Test-Path $PlanFile) {
            Write-Host ""
            Write-Host "Removing consumed saved plan..."
            Remove-Item $PlanFile -Force
        }

        Write-Host ""
        Write-Host "Deployment completed successfully."
        Write-Host ""
    }
}
catch {
    Write-Host ""
    Write-Error $_
    exit 1
}
finally {
    Pop-Location
}
