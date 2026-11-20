# Spawn MikroTik Poller

Runs on `DESKTOP-RC9JQA9` under Task Scheduler. Polls the Dicayas MikroTik
(`192.168.40.1`) and upserts into `mikrotik_status`.

## The point of this folder

The poller code used to exist **only on that Windows box**, so every change
meant pasting a whole file through remote desktop. Now the code lives here and
the box pulls it.

```
push to GitHub  ->  box picks it up on its next scheduled run
```

The only file ever pasted onto the box is `spawn_poller_launcher.py`, and only
once.

## Files

| File | Lives where | In git? |
|---|---|---|
| `spawn_poller_launcher.py` | box, `C:\SpawnPoller\` | yes |
| `mikrotik_status_poller.py` | pulled from git each run | yes |
| `.env` | box only | **no, never** |
| `.env.example` | template | yes |
| `mikrotik_status_poller.last_good.py` | box, auto-written | no |

`VendoMonitor` is a **public** repo. The MikroTik password and the Supabase
service key must stay in `.env` on the box. Anything committed here is world
readable, including in history — so a secret pushed once is a secret burned,
even if the next commit removes it.

## First-time setup

1. On the box, create `C:\SpawnPoller\`.
2. Paste `spawn_poller_launcher.py` into it. *(last paste you ever do)*
3. Create `.env` from `.env.example` and fill in the real values.
4. Point the existing Task Scheduler task at:
   - **Program:** `C:\Python311\python.exe` *(adjust to your Python path)*
   - **Arguments:** `C:\SpawnPoller\spawn_poller_launcher.py`
   - **Start in:** `C:\SpawnPoller`
5. Run the task once by hand and read `spawn_poller.log`.

## Day-to-day

Changing the poller is now just a push. Next scheduled run picks it up and the
log records which build is live:

```
2026-08-19 03:14:07Z  updated to 9f2a41c8be03 (was 4d1e77aa9012)
2026-08-19 03:14:07Z  starting poller 9f2a41c8be03
```

## How a bad push fails

Deliberately, backwards:

- **Syntax error pushed** — rejected before it can replace anything; the box
  keeps running the previous build and logs `REJECTED update`.
- **GitHub unreachable** — runs the local copy, then `.last_good`.
- **New code runs but crashes** — non-zero exit means `.last_good` is *not*
  updated, so the next run still has a known-working fallback.

Only a clean exit (`rc == 0`) promotes a build to `.last_good`.

## Watchdog: restart the poller by itself (2026-11-20)

`watchdog.ps1` runs every 5 minutes from its own Task Scheduler entry. If the poller task stopped, it starts it.
If the task says Running but the Python poller process is gone on two checks in a row, it restarts the task.
It reads no secrets and touches nothing but that one task. Log: `C:\SpawnPoller\watchdog.log`.

Install once on each poller PC, in an **Administrator** PowerShell:

1. Copy `watchdog.ps1` into `C:\SpawnPoller\`.
2. Find the poller task's name:
   ```powershell
   Get-ScheduledTask | Where-Object TaskName -like '*oller*' | Select-Object TaskName, State
   ```
3. Create the watchdog task, putting that name in place of `POLLER TASK NAME`:
   ```powershell
   schtasks /Create /TN "SpawnPollerWatchdog" /SC MINUTE /MO 5 /RU SYSTEM /RL HIGHEST /F /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\SpawnPoller\watchdog.ps1 -TaskName \"POLLER TASK NAME\""
   ```
4. Five minutes later, read `C:\SpawnPoller\watchdog.log`. An empty log means the poller was healthy.

Tests for the decision rule (touch no task): `powershell -File watchdog.tests.ps1`.

### Keep the PC awake

The watchdog cannot help a PC that is asleep or off. On each poller PC:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /hibernate off
```

Also set the BIOS to **power on after a power loss** ("Restore on AC power loss: On"), and give the poller task an
**At startup** trigger, so a brownout does not leave the poller dark until someone visits.

## Rolling back

Revert the commit and let the next run pick it up. For an emergency rollback
without waiting, on the box:

```bat
copy /Y mikrotik_status_poller.last_good.py mikrotik_status_poller.py
```

then disable the task briefly so the launcher cannot re-fetch the bad version,
or push the revert first.

## Known issues this is meant to unblock

- **No pruning.** Renaming or deleting a PPPoE secret on the router leaves its
  `mikrotik_status` row behind forever, reading offline. Currently 4 zombie
  rows and 6 near-duplicate name pairs. See `PRUNE_MISSING_SECRETS` — ship it
  with `PRUNE_DRY_RUN=true` first and read the counts.
- **PPP cadence.** Vendo rows refresh every 90s; PPP rows roughly daily, so
  outage durations are coarse. See `PPP_POLL_INTERVAL_SECONDS`.
- **No `first_seen_offline`.** 69 rows share one backfill timestamp, so their
  duration is a floor, not a measurement. `v_ppp_no_connection` now reports
  `days_down = NULL` for these and puts the lower bound in `days_down_floor`,
  rather than showing a confident wrong number.
