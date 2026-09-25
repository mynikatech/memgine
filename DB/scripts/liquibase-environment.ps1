function Set-MemgineLiquibaseEnvironment {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("local", "dev", "prod")]
        [string]$Environment,

        [string]$AwsProfile = "memgine",

        [string]$AwsRegion = "ca-central-1",

        [string]$DatabaseHost = "127.0.0.1",

        [int]$DatabasePort
    )

    if ($Environment -eq "local") {
        return
    }

    if ($DatabasePort -le 0) {
        if ($Environment -eq "dev") {
            $DatabasePort = 15432
        }
        else {
            throw "For PROD, specify -DatabasePort for the active SSM tunnel."
        }
    }

    $secretName = "memgine/$Environment/db/liquibase"

    Write-Host "Loading Liquibase credentials from AWS Secrets Manager..."
    Write-Host "Secret      : $secretName"
    Write-Host "AWS profile : $AwsProfile"
    Write-Host "AWS region  : $AwsRegion"
    Write-Host ""

    $rawSecret = & aws secretsmanager get-secret-value `
        --profile $AwsProfile `
        --region $AwsRegion `
        --secret-id $secretName `
        --query SecretString `
        --output text

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to retrieve Liquibase secret '$secretName'."
    }

    try {
        $secret = (($rawSecret | Out-String).Trim()) | ConvertFrom-Json
    }
    catch {
        throw "Liquibase secret '$secretName' does not contain valid JSON."
    }

    $requiredProperties = @(
        "username",
        "password",
        "database",
        "schema"
    )

    foreach ($property in $requiredProperties) {
        if (
            $null -eq $secret.PSObject.Properties[$property] -or
            [string]::IsNullOrWhiteSpace([string]$secret.$property)
        ) {
            throw "Liquibase secret '$secretName' is missing required property '$property'."
        }
    }

    $env:LIQUIBASE_USERNAME = [string]$secret.username
    $env:LIQUIBASE_PASSWORD = [string]$secret.password
    $env:LIQUIBASE_URL = "jdbc:postgresql://${DatabaseHost}:${DatabasePort}/$($secret.database)"

    Write-Host "Liquibase runtime configuration loaded."
    Write-Host "Username : $($secret.username)"
    Write-Host "Database : $($secret.database)"
    Write-Host "Schema   : $($secret.schema)"
    Write-Host "Host     : $DatabaseHost"
    Write-Host "Port     : $DatabasePort"
    Write-Host "Password : loaded securely from Secrets Manager"
    Write-Host ""
}

function Clear-MemgineLiquibaseEnvironment {
    Remove-Item Env:LIQUIBASE_USERNAME -ErrorAction SilentlyContinue
    Remove-Item Env:LIQUIBASE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:LIQUIBASE_URL -ErrorAction SilentlyContinue
}