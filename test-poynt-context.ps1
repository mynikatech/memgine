param(
    [Parameter(Mandatory=$true)]
    [string]$TerminalCredential
)

$baseUrl = "http://localhost:8082"

try {
    $response = Invoke-RestMethod `
        -Method Get `
        -Uri "$baseUrl/api/v1/poynt/terminal/context" `
        -Headers @{
            "X-Memgine-Poynt-Terminal" = $TerminalCredential
        }

    Write-Host "Success:"
    $response | ConvertTo-Json -Depth 10
}
catch {
    Write-Host "Request failed."

    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
    else {
        Write-Host $_.Exception.Message
    }
}