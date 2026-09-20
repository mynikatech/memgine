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
$BootstrapDir = Join-Path $ScriptDir "..\bootstrap\$Environment"
$BootstrapDir = [System.IO.Path]::GetFullPath($BootstrapDir)

$PlanFile = Join-Path $BootstrapDir "bootstrap-$Environment.tfplan"

Write-Host ""
Write-Host "Memgine Terraform Bootstrap"
Write-Host "==========================="
Write-Host "Environment : $Environment"
Write-Host "Action      : $Action"
Write-Host "AWS Profile : $AwsProfile"
Write-Host "AWS Account : $ExpectedAccountId"
Write-Host "Directory   : $BootstrapDir"
Write-Host ""

if (-not (Test-Path $BootstrapDir)) {
    Write-Error "Bootstrap directory does not exist: $BootstrapDir"
    exit 1
}

Write-Host "Checking AWS identity..."

try {
    $IdentityJson = aws sts get-caller-identity `
        --profile $AwsProfile `
        --output json

    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI identity check failed."
    }

    $Identity = $IdentityJson | ConvertFrom-Json
}
catch {
    Write-Host ""
    Write-Host "AWS SSO session is unavailable or expired."
    Write-Host ""
    Write-Host "Run:"
    Write-Host "  aws sso login --profile $AwsProfile"
    Write-Host ""
    exit 1
}

if ($Identity.Account -ne $ExpectedAccountId) {
    Write-Host ""
    Write-Error "Wrong AWS account. Expected $ExpectedAccountId but authenticated to $($Identity.Account)."
    exit 1
}

Write-Host "AWS identity verified."
Write-Host "Account: $($Identity.Account)"
Write-Host "ARN    : $($Identity.Arn)"
Write-Host ""

Push-Location $BootstrapDir

try {

    if ($Action -eq "plan") {

        Write-Host "Running terraform init..."
        terraform init

        if ($LASTEXITCODE -ne 0) {
            throw "terraform init failed."
        }

        Write-Host ""
        Write-Host "Running terraform fmt check..."
        terraform fmt -check

        if ($LASTEXITCODE -ne 0) {
            throw "terraform fmt -check failed."
        }

        Write-Host ""
        Write-Host "Running terraform validate..."
        terraform validate

        if ($LASTEXITCODE -ne 0) {
            throw "terraform validate failed."
        }

        if (Test-Path $PlanFile) {
            Write-Host ""
            Write-Host "Removing previous saved plan..."
            Remove-Item $PlanFile -Force
        }

        Write-Host ""
        Write-Host "Creating saved Terraform plan..."
        terraform plan "-out=$PlanFile"

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
        Write-Host "Review the plan above before applying."
        Write-Host ""
        Write-Host "To apply this exact saved plan, run:"
        Write-Host "  .\infra\scripts\bootstrap.ps1 $Environment apply"
        Write-Host ""
    }

    elseif ($Action -eq "apply") {

        if (-not (Test-Path $PlanFile)) {
            Write-Host ""
            Write-Error "Saved Terraform plan not found: $PlanFile"
            Write-Host ""
            Write-Host "Run the plan step first:"
            Write-Host "  .\infra\scripts\bootstrap.ps1 $Environment plan"
            Write-Host ""
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
        Write-Host "Terraform bootstrap completed."
        Write-Host "========================================"
        Write-Host ""

        Write-Host "Terraform outputs:"
        terraform output

        if ($LASTEXITCODE -ne 0) {
            throw "terraform output failed."
        }

        Write-Host ""

        if (Test-Path $PlanFile) {
            Write-Host "Removing consumed saved plan..."
            Remove-Item $PlanFile -Force
        }

        Write-Host ""
        Write-Host "Bootstrap apply completed successfully."
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