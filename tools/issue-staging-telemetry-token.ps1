[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$gateway = 'https://neural-grid-monitor-staging.onrender.com'
$viewerOrigin = 'https://neural-grid-monitor-staging.onrender.com'
$secretPointer = [IntPtr]::Zero
$issuerKey = $null

try {
    $secureKey = Read-Host 'Enter the staging TELEMETRY_SESSION_ISSUER_KEY (input is hidden)' -AsSecureString
    if ($secureKey.Length -eq 0) { throw 'Issuer key is required.' }
    $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $issuerKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)

    $headers = @{ Authorization = "Bearer $issuerKey" }
    $body = @{ origin = $viewerOrigin } | ConvertTo-Json -Compress
    $issued = Invoke-RestMethod -Method Post -Uri "$gateway/api/telemetry/sessions" `
        -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 15

    if (-not $issued.token -or $issued.expiresIn -ne 900) {
        throw 'Gateway did not issue the expected 900-second session.'
    }
    $expiresAt = [DateTimeOffset]::UtcNow.AddSeconds([double]$issued.expiresIn)
    Write-Host "Session token (valid until $($expiresAt.ToString('u'))):"
    Write-Output $issued.token
    Write-Warning 'Copy this token directly into the staging dashboard. It is not saved by this utility.'
}
catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }
    if ($statusCode -eq 401) { [Console]::Error.WriteLine('Session request rejected. Check issuer authorization and staging service configuration.') }
    elseif ($statusCode -eq 403) { [Console]::Error.WriteLine('The staging gateway rejected the configured viewer origin.') }
    else { [Console]::Error.WriteLine('Could not issue a staging session. Check network access and staging gateway configuration.') }
    exit 1
}
finally {
    if ($secretPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
    $issuerKey = $null
    $headers = $null
    $body = $null
}

