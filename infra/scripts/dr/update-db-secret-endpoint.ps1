[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "prod")]
    [string]$Environment,

    [Parameter(Mandatory = $true)]
    [ValidateSet("liquibase", "runtime")]
    [string]$SecretRole,

    [Parameter(Mandatory = $true)]
    [string]$SecretArn,

    [Parameter(Mandatory = $true)]
    [string]$NewDatabaseHost,

    [int]$NewDatabasePort = 5432,

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

$expectedConfirmation = "UPDATE-$($Environment.ToUpperInvariant())-$($SecretRole.ToUpperInvariant())-DB-ENDPOINT"
if ($Confirmation -cne $expectedConfirmation) {
    throw "Confirmation must be exactly $expectedConfirmation."
}

$expectedIdentity = @{
    dev = @{
        liquibase = @{ Username = "memgine_dev_user"; Database = "memgine_dev"; Schema = "memginedev" }
        runtime   = @{ Username = "memgine_app_dev"; Database = "memgine_dev"; Schema = "memginedev" }
    }
    prod = @{
        liquibase = @{ Username = "memgine_prod_user"; Database = "memgine_prod"; Schema = "memgineprod" }
        runtime   = @{ Username = "memgine_app_prod"; Database = "memgine_prod"; Schema = "memgineprod" }
    }
}[$Environment][$SecretRole]

$secretJson = & aws --profile $AwsProfile --region $AwsRegion --no-cli-pager `
    secretsmanager get-secret-value `
    --secret-id $SecretArn `
    --query SecretString `
    --output text
if ($LASTEXITCODE -ne 0) { throw "Unable to read the database secret." }

$secret = $secretJson | ConvertFrom-Json
foreach ($property in @("username", "password", "host", "port", "database", "schema")) {
    if ([string]::IsNullOrWhiteSpace([string]$secret.$property)) {
        throw "The database secret is missing required field '$property'."
    }
}

foreach ($property in @("Username", "Database", "Schema")) {
    if ([string]$secret.($property.ToLowerInvariant()) -cne $expectedIdentity[$property]) {
        throw "The database secret does not match the requested environment and role."
    }
}

$secret.host = $NewDatabaseHost
$secret.port = $NewDatabasePort
$updatedSecretJson = $secret | ConvertTo-Json -Compress

Write-Host "Updating the $Environment $SecretRole database secret endpoint to ${NewDatabaseHost}:$NewDatabasePort."
& aws --profile $AwsProfile --region $AwsRegion --no-cli-pager `
    secretsmanager put-secret-value `
    --secret-id $SecretArn `
    --secret-string $updatedSecretJson | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to update the database secret endpoint." }

Write-Host "Database secret endpoint updated. No service restart or traffic switch was performed."
