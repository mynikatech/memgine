
function Get-MemgineLiquibaseIdentity {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("dev", "prod")]
        [string]$Environment
    )

    return @{
        dev = @{
            Username = "memgine_dev_user"
            Database = "memgine_dev"
            Schema   = "memginedev"
        }
        prod = @{
            Username = "memgine_user"
            Database = "memgine"
            Schema   = "memgine"
        }
    }[$Environment]
}

function Assert-MemgineProdConnection {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DatabaseHost,

        [Parameter(Mandatory = $true)]
        [int]$DatabasePort,

        [Parameter(Mandatory = $true)]
        [string]$Username,

        [Parameter(Mandatory = $true)]
        [string]$Password,

        [string]$AwsProfile = "memgine",
        [string]$AwsRegion = "ca-central-1"
    )

    $expectedAccount = "482762107384"
    $expectedRdsIdentifier = "memgine-prod-postgres"
    $expectedRdsHost = "memgine-prod-postgres.cn6wim842ve1.ca-central-1.rds.amazonaws.com"

    if ($AwsRegion -ne "ca-central-1") {
        throw "PROD Liquibase requires AWS region ca-central-1."
    }

    # Verify AWS identity.
    $account = & aws sts get-caller-identity `
        --profile $AwsProfile `
        --region $AwsRegion `
        --query Account `
        --output text

    if ($LASTEXITCODE -ne 0 -or
        ($account | Out-String).Trim() -ne $expectedAccount) {
        throw "PROD AWS account verification failed."
    }

    # Verify authoritative PROD RDS details.
    $rdsJson = & aws rds describe-db-instances `
        --profile $AwsProfile `
        --region $AwsRegion `
        --db-instance-identifier $expectedRdsIdentifier `
        --query "DBInstances[0].{Identifier:DBInstanceIdentifier,Status:DBInstanceStatus,Host:Endpoint.Address,Port:Endpoint.Port,Database:DBName,Public:PubliclyAccessible}" `
        --output json

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to retrieve PROD RDS configuration."
    }

    $rds = ($rdsJson | Out-String).Trim() | ConvertFrom-Json

    if ($null -eq $rds -or
        $rds.Identifier -ne $expectedRdsIdentifier -or
        $rds.Status -ne "available" -or
        $rds.Database -ne "memgine" -or
        $rds.Public -ne $false -or
        $rds.Host -ne $expectedRdsHost -or
        [int]$rds.Port -ne 5432) {
        throw "PROD RDS configuration verification failed."
    }

    # Only allow the approved tunnel or the actual RDS endpoint.
    $isApprovedTunnel = (
        $DatabaseHost -ceq "127.0.0.1" -and
        $DatabasePort -eq 15433
    )

    $isDirectRds = (
        $DatabaseHost -ceq $expectedRdsHost -and
        $DatabasePort -eq 5432
    )

    if (-not ($isApprovedTunnel -or $isDirectRds)) {
        throw "Unapproved PROD database connection target: ${DatabaseHost}:${DatabasePort}"
    }

    if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
        throw "psql is required for PROD database identity verification."
    }

    # Resolve the authoritative RDS hostname.
    # This helps identify an incorrectly routed local tunnel.
    try {
        $expectedAddresses = @(
            [System.Net.Dns]::GetHostAddresses($expectedRdsHost) |
                ForEach-Object { $_.ToString() }
        )
    }
    catch {
        throw "Unable to resolve PROD RDS endpoint DNS."
    }

    if ($expectedAddresses.Count -eq 0) {
        throw "PROD RDS endpoint did not resolve to an IP address."
    }

    # Verify the actual database reached through the connection.
    # Password is supplied only through the process environment.
    $previousPassword = $env:PGPASSWORD
    $previousSslMode = $env:PGSSLMODE

    try {
        $env:PGPASSWORD = $Password
        $env:PGSSLMODE = "require"

        $sql = @"
SELECT
    current_database(),
    current_user,
    inet_server_addr()::text,
    inet_server_port(),
    (
        SELECT pg_get_userbyid(nspowner)
        FROM pg_namespace
        WHERE nspname = 'memgine'
    ),
    has_schema_privilege(
        current_user,
        'memgine',
        'CREATE'
    );
"@

        $probe = & psql `
            -X `
            -w `
            -A `
            -t `
            -F "|" `
            -h $DatabaseHost `
            -p $DatabasePort `
            -U $Username `
            -d memgine `
            -v ON_ERROR_STOP=1 `
            -c $sql

        if ($LASTEXITCODE -ne 0) {
            throw "PROD PostgreSQL identity probe failed."
        }

        $probeText = ($probe | Out-String).Trim()
        $fields = $probeText.Split("|")

        if ($fields.Count -ne 6) {
            throw "Unexpected PROD PostgreSQL identity probe response."
        }

        $actualDatabase = $fields[0]
        $actualUsername = $fields[1]
        $actualAddress = ($fields[2] -split '/')[0]
        $actualPort = $fields[3]
        $actualOwner = $fields[4]
        $canCreate = $fields[5]

        if ($actualDatabase -cne "memgine" -or
            $actualUsername -cne "memgine_user" -or
            $actualPort -ne "5432" -or
            $actualOwner -cne "memgine_user" -or
            $canCreate -ne "t") {
            throw "PROD database, role or schema validation failed."
        }

        if ($actualAddress -notin $expectedAddresses) {
            throw "Connected PostgreSQL server address does not match the PROD RDS endpoint."
        }

        Write-Host "PROD AWS account verified: $expectedAccount"
        Write-Host "PROD RDS verified: $expectedRdsIdentifier"
        Write-Host "Database identity verified: memgine"
        Write-Host "Liquibase role verified: memgine_user"
        Write-Host "Schema ownership and CREATE privilege verified."
        Write-Host "Database server address verified: $actualAddress"
    }
    finally {
        if ($null -eq $previousPassword) {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
        else {
            $env:PGPASSWORD = $previousPassword
        }

        if ($null -eq $previousSslMode) {
            Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
        }
        else {
            $env:PGSSLMODE = $previousSslMode
        }
    }
}

function Test-MemgineLiquibaseConnection {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Environment,

        [Parameter(Mandatory = $true)]
        [string]$Url,

        [Parameter(Mandatory = $true)]
        [string]$Username,

        [string]$Password,

        [string]$AwsProfile = "memgine",

        [string]$AwsRegion = "ca-central-1"
    )

    $identity = Get-MemgineLiquibaseIdentity `
        -Environment $Environment

    $match = [regex]::Match(
        $Url,
        '^jdbc:postgresql://(?<host>[^/:]+)(?::(?<port>\d+))?/(?<database>[^?]+)'
    )

    if (-not $match.Success) {
        throw "LIQUIBASE_URL must be a PostgreSQL JDBC URL."
    }

    if ($match.Groups['database'].Value -cne $identity.Database -or
        $Username -cne $identity.Username) {
        throw "Liquibase connection does not match the expected $Environment database identity."
    }

    if ($Environment -eq "prod") {
        if ([string]::IsNullOrWhiteSpace($Password)) {
            throw "PROD Liquibase password is missing."
        }

        $databaseHost = $match.Groups['host'].Value
        $databasePort = if ($match.Groups['port'].Success) {
            [int]$match.Groups['port'].Value
        }
        else {
            5432
        }

        Assert-MemgineProdConnection `
            -DatabaseHost $databaseHost `
            -DatabasePort $databasePort `
            -Username $Username `
            -Password $Password `
            -AwsProfile $AwsProfile `
            -AwsRegion $AwsRegion
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

    if ($Environment -eq "local") {
        return
    }

    $existing = @{
        LIQUIBASE_URL = $env:LIQUIBASE_URL
        LIQUIBASE_USERNAME = $env:LIQUIBASE_USERNAME
        LIQUIBASE_PASSWORD = $env:LIQUIBASE_PASSWORD
    }

    $present = @(
        $existing.Values |
            Where-Object {
                -not [string]::IsNullOrWhiteSpace($_)
            }
    ).Count

    if ($present -gt 0 -and $present -lt 3) {
        throw "LIQUIBASE_URL, LIQUIBASE_USERNAME, and LIQUIBASE_PASSWORD must be supplied together."
    }

    if ($present -eq 3) {
        Test-MemgineLiquibaseConnection `
            -Environment $Environment `
            -Url $existing.LIQUIBASE_URL `
            -Username $existing.LIQUIBASE_USERNAME `
            -Password $existing.LIQUIBASE_PASSWORD `
            -AwsProfile $AwsProfile `
            -AwsRegion $AwsRegion

        return
    }

    # Preserve the proven DEV defaults.
    if ([string]::IsNullOrWhiteSpace($DatabaseHost)) {
        if ($Environment -eq "dev") {
            $DatabaseHost = "127.0.0.1"
        }
        else {
            throw "For PROD, specify -DatabaseHost for the approved SSM tunnel or RDS endpoint."
        }
    }

    if ($DatabasePort -le 0) {
        if ($Environment -eq "dev") {
            $DatabasePort = 15432
        }
        else {
            throw "For PROD, specify -DatabasePort for the approved SSM tunnel or RDS endpoint."
        }
    }

    $secretName = "memgine/$Environment/db/liquibase"

    Write-Host "Loading Liquibase credentials from AWS Secrets Manager..."

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
        $secret = (($rawSecret | Out-String).Trim()) |
            ConvertFrom-Json
    }
    catch {
        throw "Liquibase secret '$secretName' does not contain valid JSON."
    }

    foreach ($property in @(
        "username",
        "password",
        "database",
        "schema"
    )) {
        if ($null -eq $secret.PSObject.Properties[$property] -or
            [string]::IsNullOrWhiteSpace([string]$secret.$property)) {
            throw "Liquibase secret '$secretName' is missing required property '$property'."
        }
    }

    $identity = Get-MemgineLiquibaseIdentity `
        -Environment $Environment

    if ($secret.username -cne $identity.Username -or
        $secret.database -cne $identity.Database -or
        $secret.schema -cne $identity.Schema) {
        throw "Liquibase secret does not match the expected $Environment database, schema, and role."
    }

    if ($Environment -eq "prod") {
        if ($secret.host -cne "memgine-prod-postgres.cn6wim842ve1.ca-central-1.rds.amazonaws.com" -or
            [int]$secret.port -ne 5432) {
            throw "PROD Liquibase secret endpoint does not match PROD RDS."
        }
    }

    $url = "jdbc:postgresql://${DatabaseHost}:${DatabasePort}/$($secret.database)"

    Test-MemgineLiquibaseConnection `
        -Environment $Environment `
        -Url $url `
        -Username $secret.username `
        -Password $secret.password `
        -AwsProfile $AwsProfile `
        -AwsRegion $AwsRegion

    $script:MemgineLiquibaseEnvironmentState = $existing

    $env:LIQUIBASE_URL = $url
    $env:LIQUIBASE_USERNAME = [string]$secret.username
    $env:LIQUIBASE_PASSWORD = [string]$secret.password

    Write-Host "Liquibase runtime configuration loaded for $Environment."
}

function Clear-MemgineLiquibaseEnvironment {
    if ($null -eq $script:MemgineLiquibaseEnvironmentState) {
        return
    }

    foreach ($key in @(
        "LIQUIBASE_URL",
        "LIQUIBASE_USERNAME",
        "LIQUIBASE_PASSWORD"
    )) {
        $previous = $script:MemgineLiquibaseEnvironmentState[$key]

        if ($null -eq $previous) {
            Remove-Item "Env:$key" -ErrorAction SilentlyContinue
        }
        else {
            Set-Item "Env:$key" $previous
        }
    }

    $script:MemgineLiquibaseEnvironmentState = $null
}
