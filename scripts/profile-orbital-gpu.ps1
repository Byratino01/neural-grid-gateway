param(
  [int]$DurationSeconds = 120,
  [int]$IntervalMilliseconds = 1000,
  [string]$OutputDirectory = ".\\gpu-profiles"
)
$ErrorActionPreference = 'Stop'
if ($DurationSeconds -lt 5 -or $DurationSeconds -gt 3600) { throw "DurationSeconds must be 5..3600" }
if ($IntervalMilliseconds -lt 250 -or $IntervalMilliseconds -gt 10000) { throw "IntervalMilliseconds must be 250..10000" }
$exe = (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue).Source
if (-not $exe) {
  $candidate = Join-Path $env:ProgramFiles 'NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'
  if (Test-Path $candidate) { $exe = $candidate }
}
if (-not $exe) { throw "nvidia-smi.exe not found. Install or update NVIDIA driver." }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $OutputDirectory "orbital-gpu-$stamp.csv"
$fields = 'timestamp,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.gr,clocks.mem'
$rows = [System.Collections.Generic.List[object]]::new()
$end = (Get-Date).AddSeconds($DurationSeconds)
Write-Host "Profiling NVIDIA GPU for $DurationSeconds seconds. Open the Neural Grid viewer with ?renderStats=1."
while ((Get-Date) -lt $end) {
  $result = & $exe "--query-gpu=$fields" '--format=csv,noheader,nounits' 2>&1
  if ($LASTEXITCODE -ne 0) { throw "nvidia-smi failed: $result" }
  foreach ($line in $result) {
    $parts = @("$line" -split ',\\s*')
    if ($parts.Count -ne 8) { continue }
    $rows.Add([pscustomobject]@{
      LocalTime = (Get-Date).ToString('o')
      GpuTimestamp = $parts[0].Trim()
      GpuUtilizationPercent = $parts[1].Trim()
      VramUsedMiB = $parts[2].Trim()
      VramTotalMiB = $parts[3].Trim()
      GpuTemperatureC = $parts[4].Trim()
      PowerWatts = $parts[5].Trim()
      GraphicsClockMHz = $parts[6].Trim()
      MemoryClockMHz = $parts[7].Trim()
    })
  }
  Start-Sleep -Milliseconds $IntervalMilliseconds
}
$rows | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $out
Write-Host "Saved $($rows.Count) samples to $out"
Write-Host "Note: VRAM usage is whole-GPU, not exclusive to Chrome/Neural Grid. No data is uploaded."
