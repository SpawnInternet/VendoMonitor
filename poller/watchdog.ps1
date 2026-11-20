<#
  Spawn poller watchdog (2026-11-20).  Runs on the poller PC every 5 minutes from its own Task Scheduler entry.

  What it does: checks that the poller's scheduled task is running AND that its Python process
  (mikrotik_status_poller.py) is alive. If the task stopped, it starts it. If the task says "Running"
  but the poller process is gone on two checks in a row, it stops and starts the task.
  What it never does: read .env, touch the database, the router, or the network. No secrets.
  It cannot help if the PC itself is off or asleep — see README "Keep the PC awake".

  Install (once, as Administrator, on the poller PC):
    Copy this file to C:\SpawnPoller\watchdog.ps1, then
    schtasks /Create /TN "SpawnPollerWatchdog" /SC MINUTE /MO 5 /RU SYSTEM /RL HIGHEST /F ^
      /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\SpawnPoller\watchdog.ps1 -TaskName \"<poller task name>\""
  Find the poller task name with:  Get-ScheduledTask | Where-Object TaskName -like '*oller*' | Select TaskName,State
  Log: C:\SpawnPoller\watchdog.log
#>
param(
  [string]$TaskName = '',
  [string]$Folder = 'C:\SpawnPoller',
  [switch]$LoadOnly
)

# Pure decision rule (tested by watchdog.tests.ps1). TaskState: Ready | Running | Disabled | Queued | $null (task not found).
function Get-WatchdogAction {
  param($TaskState, [bool]$PollerRunning, [int]$Misses)
  if ($null -eq $TaskState -or $TaskState -eq '') { return 'missing' }
  if ($TaskState -eq 'Disabled') { return 'none' }          # someone turned it off on purpose
  if ($TaskState -ne 'Running') { return 'start' }
  if ($PollerRunning) { return 'none' }
  if ($Misses -ge 1) { return 'restart' }                   # second check in a row without the poller process
  return 'wait'
}

if ($LoadOnly) { return }

$log = Join-Path $Folder 'watchdog.log'
$stateFile = Join-Path $Folder 'watchdog.state'
function Write-Log($msg) {
  try {
    if ((Test-Path $log) -and ((Get-Item $log).Length -gt 1MB)) { Move-Item $log "$log.1" -Force }
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Out-File -FilePath $log -Append -Encoding utf8
  } catch {}
}

if (-not $TaskName) { Write-Log 'no -TaskName given; nothing to watch'; exit 2 }

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$state = if ($task) { [string]$task.State } else { $null }
$poller = @(Get-CimInstance Win32_Process -Filter "Name like 'python%'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match 'mikrotik_status_poller|spawn_poller_launcher' })
$misses = 0; try { $misses = [int](Get-Content $stateFile -ErrorAction Stop) } catch {}

$action = Get-WatchdogAction -TaskState $state -PollerRunning ($poller.Count -gt 0) -Misses $misses
switch ($action) {
  'missing' { Write-Log "task '$TaskName' not found" }
  'start'   { Write-Log "task was '$state' -> starting"; Start-ScheduledTask -TaskName $TaskName; $misses = 0 }
  'restart' { Write-Log "task Running but poller process gone twice -> restarting"; Stop-ScheduledTask -TaskName $TaskName; Start-Sleep 5; Start-ScheduledTask -TaskName $TaskName; $misses = 0 }
  'wait'    { Write-Log "task Running but poller process not seen -> will restart if still missing in 5 min"; $misses = 1 }
  default   { $misses = 0 }
}
try { "$misses" | Out-File -FilePath $stateFile -Encoding ascii } catch {}
exit 0
