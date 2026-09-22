param(
    [Parameter(Mandatory=$true)]
    [string]$TerminalCredential,

    [Parameter(Mandatory=$true)]
    [string]$StaffId,

    [Parameter(Mandatory=$true)]
    [string]$Pin
)

$baseUrl = "http://localhost:8082"

$body = @{
    staffId = $StaffId
    pin     = $Pin
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/api/v1/poynt/terminal/unlock" `
        -Headers @{
            "X-Memgine-Poynt-Terminal" = $TerminalCredential
        } `
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