#!/usr/bin/env python3
"""
Spawn Poller Launcher  --  the ONLY file that ever gets pasted onto the box.

Task Scheduler runs this. It pulls the current poller code from GitHub, checks
it compiles, and runs it. Change the poller by pushing to GitHub; the box picks
it up on the next run. No more remote-desktop copy-paste.

WHY A LAUNCHER INSTEAD OF `git pull`:
  The box needs no git install, no credentials, and no working tree that can
  end up dirty or mid-merge when Task Scheduler fires.

SAFETY (this runs unattended against production, so it fails backwards):
  * The downloaded file must compile before it is allowed to replace anything.
  * The last version that ran successfully is kept as .last_good and is used
    whenever GitHub is unreachable or the new code is broken. A bad push
    therefore cannot take the poller down -- it keeps running the old code and
    says so in the log.
  * Secrets are read from a local .env that is NEVER in git.

SETUP (once):
  1. mkdir C:\\SpawnPoller  and put this file there
  2. create C:\\SpawnPoller\\.env  (see .env.example) -- keep it off git
  3. Task Scheduler -> action:
        Program:   C:\\Python311\\python.exe
        Arguments: C:\\SpawnPoller\\spawn_poller_launcher.py
        Start in:  C:\\SpawnPoller
"""

import hashlib
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ---- where the poller code lives (branch is pinned on purpose) --------------
REPO   = "SpawnInternet/VendoMonitor"
BRANCH = "main"
REMOTE = "poller/mikrotik_status_poller.py"

RAW_URL = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{REMOTE}"

HERE      = Path(__file__).resolve().parent
CURRENT   = HERE / "mikrotik_status_poller.py"
LAST_GOOD = HERE / "mikrotik_status_poller.last_good.py"
ENV_FILE  = HERE / ".env"
LOG_FILE  = HERE / "spawn_poller.log"

FETCH_TIMEOUT = 20


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S}Z  {msg}"
    print(line, flush=True)
    try:
        # keep the log from growing without bound on a box nobody logs into
        if LOG_FILE.exists() and LOG_FILE.stat().st_size > 5_000_000:
            LOG_FILE.rename(LOG_FILE.with_suffix(".log.1"))
        with LOG_FILE.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass  # logging must never be the thing that kills the poller


def load_env() -> dict:
    """Read KEY=VALUE from .env. Secrets stay on this machine, never in git."""
    env = {}
    if not ENV_FILE.exists():
        log(f"FATAL: {ENV_FILE} missing -- copy .env.example and fill it in")
        sys.exit(2)
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def fetch_remote() -> bytes | None:
    """Pull the latest poller. Returns None on any failure -- caller falls back."""
    try:
        req = urllib.request.Request(
            RAW_URL,
            headers={"User-Agent": "spawn-poller-launcher", "Cache-Control": "no-cache"},
        )
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as r:
            body = r.read()
        if len(body) < 200:
            log(f"remote file suspiciously small ({len(body)}B) -- ignoring")
            return None
        return body
    except Exception as e:
        log(f"fetch failed ({e.__class__.__name__}: {e}) -- using local copy")
        return None


def compiles(src: bytes, label: str) -> bool:
    """A syntax error must never reach production unattended."""
    try:
        compile(src, label, "exec")
        return True
    except SyntaxError as e:
        log(f"REJECTED update: {label} line {e.lineno}: {e.msg}")
        return False


def resolve_source() -> Path | None:
    """Decide which code to run, preferring fresh-and-valid over stale."""
    remote = fetch_remote()

    if remote is not None and compiles(remote, "remote"):
        old = CURRENT.read_bytes() if CURRENT.exists() else b""
        if sha(old) != sha(remote):
            CURRENT.write_bytes(remote)
            log(f"updated to {sha(remote)} (was {sha(old) if old else 'none'})")
        else:
            log(f"already current at {sha(remote)}")
        return CURRENT

    # Remote unavailable or broken -- fall back, in order of preference.
    for path, why in ((CURRENT, "local"), (LAST_GOOD, "last_good")):
        if path.exists() and compiles(path.read_bytes(), path.name):
            log(f"running {why} copy {sha(path.read_bytes())}")
            return path

    log("FATAL: no runnable poller source anywhere")
    return None


def main() -> int:
    log("=" * 60)
    src = resolve_source()
    if src is None:
        return 2

    env = os.environ.copy()
    env.update(load_env())
    # let the poller identify its own build in the heartbeat detail
    env["SPAWN_POLLER_VERSION"] = sha(src.read_bytes())

    log(f"starting poller {env['SPAWN_POLLER_VERSION']}")
    started = time.time()
    try:
        rc = subprocess.call([sys.executable, str(src)], cwd=str(HERE), env=env)
    except KeyboardInterrupt:
        log("interrupted")
        return 130

    dur = int(time.time() - started)

    if rc == 0:
        # Only a clean exit earns promotion to last_good. This is what makes a
        # bad push survivable: the previous working build is still on disk.
        try:
            LAST_GOOD.write_bytes(src.read_bytes())
        except Exception as e:
            log(f"could not update last_good: {e}")
        log(f"poller exited cleanly after {dur}s")
    else:
        log(f"poller exited rc={rc} after {dur}s -- last_good left untouched")

    return rc


if __name__ == "__main__":
    sys.exit(main())
