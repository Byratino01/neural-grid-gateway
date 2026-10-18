# Staging telemetry session token (Windows 11)

This operator-side PowerShell utility requests a single 15-minute, read-only token from the existing staging gateway. It is not a browser feature and does not change gateway authorization. The issuer key must already be available to an authorized staging operator; it remains server-side and is never entered in the dashboard.

1. Open PowerShell 7 or Windows PowerShell on a trusted Windows 11 device.
2. From the repository folder, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\issue-staging-telemetry-token.ps1` (or use `pwsh` in place of `powershell`).
3. Enter the staging `TELEMETRY_SESSION_ISSUER_KEY` at the hidden prompt. Do not pass it as an argument, put it in a script, or paste it into chat.
4. Copy the displayed token into **Authentication settings → Short-lived read-only session token** on the staging viewer, then click **Connect**. The viewer clears the field immediately after use.
5. The utility prints the UTC expiry time. At expiry, the viewer disconnects; run the utility again to obtain a new token.

The utility targets only `https://neural-grid-monitor-staging.onrender.com` as both gateway and allowed viewer origin. It does not save tokens or credentials. Treat the displayed token as a temporary bearer credential; do not save it, send it to others, or include it in diagnostic output. If issuance returns unauthorized or origin rejected, stop and ask the staging service administrator to verify the existing issuer/signing keys and allowed-origin configuration. Do not change production settings or weaken origin checks.

