function Get-MemgineLiquibaseIdentity {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("dev", "prod")]
        [string]$Environment
    )

    return @{
        dev = @{ Username = "memgine_dev_user"; Database = "memgine_dev"; Schema = "memginedev" }
        prod = @{ Username = "memgine_user"; Database = "memgine"; Schema = "memgine" }
    }[$Environment]
}

function Test-MemgineLiquibaseConnection {
    param(
        [Parameter(Mandatory = $true)] [string]$Environment,
        [Parameter(Mandatory = $true)] [string]$Url,
        [Parameter(Mandatory = $true)] [string]$Username
    )

    $identity = Get-MemgineLiquibaseIdentity -Environment $Environment
    $match = [regex]::Match($Url, '^jdbc:postgresql://(?<host>[^/:]+)(?::(?<port>\d+))?/(?<database>[^?]+)')
    if (-not $match.Success) {
        throw "LIQUIBASE_URL must be a PostgreSQL JDBC URL."
    }
    if ($match.Groups['database'].Value -ne $identity.Database -or $Username -cne $identity.Username) {
        throw "Liquibase connection does not match the expected $Environment database identity."
    }
    if ($Environment -eq 'prod' -and $match.Groups['host'].Value -in @('127.0.0.1', 'localhost', '::1')) {
        throw "PROD Liquibase must not connect to localhost."
    }
}

function Set-MemgineLiquibaseEnvironment {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("local", "dev", "prod")]
        [string]$Environment,

        [string]$AwsProfile = "memgine",
        [string]$AwsRegion = "ca-central-1",
        [string]$DatabaseHost,
        [int]$DatabasePort
    )

    $script:MemgineLiquibaseEnvironmentState = $null
    if ($Environment -eq "local") { return }

    $existing = @{
        LIQUIBASE_URL = $env:LIQUIBASE_URL
        LIQUIBASE_USERNAME = $env:LIQUIBASE_USERNAME
        LIQUIBASE_PASSWORD = $env:LIQUIBASE_PASSWORD
    }
    $present = @($existing.Values | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
    if ($present -gt 0 -and $present -lt 3) {
        throw "LIQUIBASE_URL, LIQUIBASE_USERNAME, and LIQUIBASE_PASSWORD must be supplied together."
    }
    if ($present -eq 3) {
        Test-MemgineLiquibaseConnection -Environment $Environment -Url $existing.LIQUIBASE_URL -Username $existing.LIQUIBASE_USERNAME
        return
    }

    if ([string]::IsNullOrWhiteSpace($DatabaseHost)) {
        if ($Environment -eq 'dev') { $DatabaseHost = '127.0.0.1' }
        else { throw "For PROD, specify -DatabaseHost for the active SSM tunnel or RDS endpoint." }
    }
    if ($DatabasePort -le 0) {
        if ($Environment -eq 'dev') { $DatabasePort = 15432 }
        else { throw "For PROD, specify -DatabasePort for the active SSM tunnel or RDS endpoint." }
    }
    if ($Environment -eq 'prod' -and $DatabaseHost -in @('127.0.0.1', 'localhost', '::1')) {
        throw "PROD Liquibase must not connect to localhost."
    }

    $secretName = "memgine/$Environment/db/liquibase"
    Write-Host "Loading Liquibase credentials from AWS Secrets Manager..."
    $rawSecret = & aws secretsmanager get-secret-value --profile $AwsProfile --region $AwsRegion --secret-id $secretName --query SecretString --output text
    if ($LASTEXITCODE -ne 0) { throw "Unable to retrieve Liquibase secret '$secretName'." }
    try { $secret = (($rawSecret | Out-String).Trim()) | ConvertFrom-Json }
    catch { throw "Liquibase secret '$secretName' does not contain valid JSON." }

    foreach ($property in @('username', 'password', 'database', 'schema')) {
        if ($null -eq $secret.PSObject.Properties[$property] -or [string]::IsNullOrWhiteSpace([string]$secret.$property)) {
            throw "Liquibase secret '$secretName' is missing required property '$property'."
        }
    }
    $identity = Get-MemgineLiquibaseIdentity -Environment $Environment
    if ($secret.username -cne $identity.Username -or $secret.database -cne $identity.Database -or $secret.schema -cne $identity.Schema) {
        throw "Liquibase secret does not match the expected $Environment database, schema, and role."
    }

    $url = "jdbc:postgresql://${DatabaseHost}:${DatabasePort}/$($secret.database)"
    Test-MemgineLiquibaseConnection -Environment $Environment -Url $url -Username $secret.username
    $script:MemgineLiquibaseEnvironmentState = $existing
    $env:LIQUIBASE_URL = $url
    $env:LIQUIBASE_USERNAME = [string]$secret.username
    $env:LIQUIBASE_PASSWORD = [string]$secret.password
    Write-Host "Liquibase runtime configuration loaded for $Environment."
}

function Clear-MemgineLiquibaseEnvironment {
    if ($null -eq $script:MemgineLiquibaseEnvironmentState) { return }
    foreach ($key in @('LIQUIBASE_URL', 'LIQUIBASE_USERNAME', 'LIQUIBASE_PASSWORD')) {
        $previous = $script:MemgineLiquibaseEnvironmentState[$key]
        if ($null -eq $previous) { Remove-Item "Env:$key" -ErrorAction SilentlyContinue }
        else { Set-Item "Env:$key" $previous }
    }
    $script:MemgineLiquibaseEnvironmentState = $null
}
