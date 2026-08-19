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
