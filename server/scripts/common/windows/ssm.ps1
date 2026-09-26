$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$env:AWS_CLI_FILE_ENCODING = "utf-8"

function Send-MemgineSsmCommand {
    param([string]$AwsProfile, [string]$InstanceId, [string]$Command)

    $request = [ordered]@{
        InstanceIds   = @($InstanceId)
        DocumentName  = "AWS-RunShellScript"
        Parameters    = [ordered]@{
            commands = @($Command)
        }
    }
    $temporaryFile = Join-Path ([System.IO.Path]::GetTempPath()) ("memgine-ssm-" + [guid]::NewGuid().ToString("N") + ".json")

    try {
        $requestJson = ConvertTo-Json -InputObject $request -Depth 5 -Compress
        [System.IO.File]::WriteAllText($temporaryFile, $requestJson, $utf8)
        $jsonFileArgument = "file://" + $temporaryFile.Replace("\", "/")
        $commandIdOutput = & aws --profile $AwsProfile --no-cli-pager ssm send-command `
            --cli-input-json $jsonFileArgument `
            --query "Command.CommandId" `
            --output text 2>&1
        if ($LASTEXITCODE -ne 0) {
            $errorOutput = [string]::Join([Environment]::NewLine, [string[]]$commandIdOutput)
            throw "Unable to start SSM command: $errorOutput"
        }

        $commandId = [string]::Join([Environment]::NewLine, [string[]]$commandIdOutput).Trim()
        if ([string]::IsNullOrWhiteSpace($commandId)) {
            throw "AWS did not return an SSM command ID."
        }
        return $commandId
    }
    finally {
        Remove-Item -LiteralPath $temporaryFile -Force -ErrorAction SilentlyContinue
    }
}

function Get-MemgineSsmInvocation {
    param([string]$AwsProfile, [string]$CommandId, [string]$InstanceId)

    $jsonOutput = & aws --profile $AwsProfile --no-cli-pager ssm get-command-invocation `
        --command-id $CommandId --instance-id $InstanceId --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to retrieve SSM command invocation $CommandId."
    }

    $json = [string]::Join([Environment]::NewLine, [string[]]$jsonOutput)
    try { return ConvertFrom-Json -InputObject $json -ErrorAction Stop }
    catch { throw "SSM returned invalid JSON for command ${CommandId}: $($_.Exception.Message)" }   
}

function Wait-MemgineSsmCommand {
    param(
        [string]$AwsProfile,
        [string]$CommandId,
        [string]$InstanceId,
        [int]$TimeoutSeconds = 900,
        [int]$PollIntervalSeconds = 5
    )

    $startedAt = [DateTime]::UtcNow
    $latestStatus = "Unknown"

    while ($true) {
        $invocation = $null
        try {
            $invocation = Get-MemgineSsmInvocation $AwsProfile $CommandId $InstanceId
            $latestStatus = [string]$invocation.Status
        }
        catch {
            $latestStatus = "Unavailable"
        }

        if ($null -ne $invocation) {
            switch ($latestStatus) {
                "Success" { return $invocation }
                "Failed" { Assert-MemgineSsmSuccess $invocation }
                "TimedOut" { Assert-MemgineSsmSuccess $invocation }
                "Cancelled" { Assert-MemgineSsmSuccess $invocation }
                "Cancelling" { Assert-MemgineSsmSuccess $invocation }
                "Pending" { }
                "InProgress" { }
                "Delayed" { }
                default { }
            }
        }

        $elapsedSeconds = [Math]::Floor(([DateTime]::UtcNow - $startedAt).TotalSeconds)
        if ($elapsedSeconds -ge $TimeoutSeconds) {
            Write-Output "CommandId: $CommandId"
            Write-Output "Latest remote Status: $latestStatus"
            Write-Output "ElapsedSeconds: $elapsedSeconds"
            throw "Local wait timed out before the SSM command reached a terminal state."
        }

        Start-Sleep -Seconds $PollIntervalSeconds
    }
}

function Assert-MemgineSsmSuccess {
    param($Invocation)

    if ($Invocation.Status -eq "Success") { return }
    Write-Output "Status: $($Invocation.Status)"
    Write-Output "ResponseCode: $($Invocation.ResponseCode)"
    Write-Output "StandardOutputContent:"
    Write-Output $Invocation.StandardOutputContent
    Write-Output "StandardErrorContent:"
    Write-Output $Invocation.StandardErrorContent
    throw "Remote SSM command failed with status $($Invocation.Status)."
}
