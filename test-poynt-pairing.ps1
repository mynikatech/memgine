param(
    [Parameter(Mandatory=$true)]
    [string]$SessionValue,

    [Parameter(Mandatory=$true)]
    [string]$StoreId
)

$orgId = "org-1788708324971-hcia1i0a"
$baseUrl = "http://localhost:8082"

$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$cookie = [System.Net.Cookie]::new()
$cookie.Name = "memgine_session"
$cookie.Value = $SessionValue
$cookie.Path = "/"
$cookie.Domain = "localhost"

$webSession.Cookies.Add($cookie)

$body = @{
    storeId = $StoreId
} | ConvertTo-Json

Write-Host "Calling Poynt pairing-code endpoint..."

try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/api/v1/organizations/$orgId/poynt/pairing-codes" `
        -WebSession $webSession `
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