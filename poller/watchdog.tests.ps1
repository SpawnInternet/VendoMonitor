# Tests for the poller watchdog's decision rule (no task is touched; only the pure function is called).
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'watchdog.ps1') -LoadOnly

$fail = 0
function Check($name, $got, $want) {
  if ($got -ne $want) { Write-Host "FAIL $name : got '$got' want '$want'"; $script:fail++ } else { Write-Host "ok   $name" }
}

Check 'task stopped -> start'                      (Get-WatchdogAction -TaskState 'Ready'    -PollerRunning $false -Misses 0) 'start'
Check 'task disabled -> leave alone'               (Get-WatchdogAction -TaskState 'Disabled' -PollerRunning $false -Misses 0) 'none'
Check 'running with poller -> nothing'             (Get-WatchdogAction -TaskState 'Running'  -PollerRunning $true  -Misses 3) 'none'
Check 'running, poller missing once -> wait'       (Get-WatchdogAction -TaskState 'Running'  -PollerRunning $false -Misses 0) 'wait'
Check 'running, poller missing twice -> restart'   (Get-WatchdogAction -TaskState 'Running'  -PollerRunning $false -Misses 1) 'restart'
Check 'task missing -> report'                     (Get-WatchdogAction -TaskState $null      -PollerRunning $false -Misses 0) 'missing'

if ($fail -gt 0) { Write-Host "$fail failed"; exit 1 } else { Write-Host 'all passed'; exit 0 }
