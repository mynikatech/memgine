param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("dev")]
    [string]$Environment,

    [Parameter(Mandatory = $true, Position = 1)]
    [ValidateSet("plan", "apply")]
    [string]$Action
)

$ErrorActionPreference = "Stop"

$Accounts = @{
    dev = @{
        AccountId = "482762107384"
        Profile   = "memgine"
    }
}

$ExpectedAccountId = $Accounts[$Environment].AccountId
$AwsProfile = $Accounts[$Environment].Profile

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
Write-Host "AWS Profile : $AwsProfile"
Write-Host "AWS Account : $ExpectedAccountId"
Write-Host "Directory   : $EnvDir"
Write-Host ""

Write-Host "Checking AWS identity..."

$PreviousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"

$IdentityJson = aws sts get-caller-identity --profile $AwsProfile --output json 2>&1
$IdentityExitCode = $LASTEXITCODE

$ErrorActionPreference = $PreviousErrorActionPreference

if ($IdentityExitCode -ne 0) {
    Write-Host ""
    Write-Host "AWS session is unavailable or expired."
    Write-Host ""
    Write-Host "Authenticate first with:"
    Write-Host "  aws sso login --profile $AwsProfile"
    Write-Host ""
    exit 1
}

$Identity = $IdentityJson | ConvertFrom-Json

if ($Identity.Account -ne $ExpectedAccountId) {
    Write-Error "Wrong AWS account. Expected $ExpectedAccountId but authenticated to $($Identity.Account)."
    exit 1
}

Write-Host "AWS identity verified."
Write-Host "Account: $($Identity.Account)"
Write-Host "ARN    : $($Identity.Arn)"
Write-Host ""

Push-Location $EnvDir

try {
    if ($Action -eq "plan") {
        Write-Host "Running terraform init..."

        terraform init "-backend-config=$BackendFile"

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

        terraform plan "-var-file=$VarFile" "-out=$PlanFile"

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