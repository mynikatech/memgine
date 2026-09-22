param(
    [Parameter(Mandatory=$true)]
    [string]$PairingCode
)

$baseUrl = "http://localhost:8082"

$body = @{
    pairingCode     = $PairingCode
    poyntBusinessId = "test-business-001"
    poyntStoreId    = "test-store-001"
    poyntTerminalId = "test-terminal-001"
    deviceName      = "Test Poynt Terminal"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/api/v1/poynt/pairing/complete" `
        -ContentType "application/json" `
        -Body $body

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