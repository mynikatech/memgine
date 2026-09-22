param(
    [Parameter(Mandatory=$true)]
    [string]$SessionToken,

    [Parameter(Mandatory=$true)]
    [string]$StaffId,

    [Parameter(Mandatory=$true)]
    [string]$SubscriptionId
)

$baseUrl = "http://localhost:8082"
$orgId = "org-1788708324971-hcia1i0a"
$storeId = "store-1788763175550"

try {
    $response = Invoke-RestMethod `
        -Method Get `
        -Uri "$baseUrl/api/v1/organizations/$orgId/counter/subscriptions/$SubscriptionId/benefits?storeId=$storeId&staffId=$StaffId" `
        -Headers @{
            "X-Memgine-Session" = $SessionToken
        }

    Write-Host "Success:"
    $response | ConvertTo-Json -Depth 10
}
catch {
    Write-Host "Request failed."
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    } else {
        Write-Host $_.Exception.Message
    }
}