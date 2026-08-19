#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SPAWN Internet — MikroTik Status Poller  (v16)
=========================================================
Runs every POLL_SECONDS on the 24/7 office server.
- Connects to the office MikroTik router (API port 8728)
- Reads live PPP active sessions + PPPoE secrets (online/offline)
- Upserts each into Supabase `mikrotik_status` (keyed by match_key)
- Writes a HEARTBEAT to `system_heartbeat` every cycle
- Pulls freewifi hotspot vouchers INCLUDING each vendo's voucher CODE

Deployed on the office server only (holds router creds).
Launched by spawn_poller_launcher.py, which pulls this file from GitHub, so
changes ship by pushing rather than by pasting through remote desktop.

--------------------------------------------------------------------
PATCH 2026-07-22: sb_upsert normalizes key sets across the batch and
chunks at 200 rows (PostgREST PGRST102 fix).  KEPT.

PATCH 2026-07-24 (v8): RESTORED the v7 vendo online-detection logic.
The old base used the interface `running` flag, which is ALWAYS true even
when a vendo is physically unplugged.
  lease_status = status of the vendo's OWN lease (the .10 host on its VLAN)
  online       = (not disabled) AND (lease bound OR live traffic OR users)
  maybe_noise  = no lease + tiny movement (<= NOISE_BYTES)
  online_via   = 'lease' | 'users' | 'traffic' | None

PATCH 2026-07-25 (v13): leases whose DHCP server is "all" were silently
dropped. derive_vlan_from_ip() is now a FALLBACK ONLY, for the vendo's own
.10 host lease, and only when the derived VLAN exists as a real interface.

PATCH 2026-07-25 (v14): offline_since was mass-reset at the v13 restart,
because a FAILED history fetch was indistinguishable from an empty table.
fetch_previous_state() now returns None on failure, offline_since is then
OMITTED FROM EVERY ROW, and history is read with Range-header pagination.

PATCH 2026-07-27 (v15): capture the PPPoE secret's PROFILE, COMMENT and
DISABLED flag. Profile is the billing state ("20k" = throttled/cut off).
mikrotik_status.service_state is GENERATED ALWAYS from those plus `online`
and must NEVER be written from here.

--------------------------------------------------------------------
PATCH 2026-08-19 (v16): MAKE FAILED WRITES VISIBLE.  <-- the important one

For roughly two months every ppp row silently stopped updating, and nothing
anywhere said so. Root cause was in the DATABASE, not here:

  log_ppp_state_change() was a SECURITY INVOKER trigger inserting into
  subscriber_online_log. The Aug 2026 RLS hardening left anon with no INSERT
  on that table, so:

      a ppp line flips online
        -> trigger fires
        -> INSERT raises 42501 insufficient_privilege
        -> the WHOLE 200-row PostgREST chunk aborts
        -> _sb_request() returned None and printed to a console nobody reads
        -> mikrotik_status ppp rows never updated

  It could not self-heal: with the stored `online` frozen, each new attempt
  flipped even more rows, so the chunk failed again every time. vendo rows
  were unaffected because that trigger returns early for kind<>'ppp' -- which
  is exactly why the symptom looked like "ppp is slow" rather than "writes
  are failing". The trigger is now SECURITY DEFINER and ppp recovered on the
  next full-refresh cycle with no change to this file.

The DATABASE bug is fixed. What this patch fixes is the reason it went
unnoticed for two months: a swallowed error.

  1. _sb_request() records every failure in _SB_ERRORS instead of only
     printing. Return value is unchanged, so no caller behaviour changes.
  2. sb_upsert() reports how many chunks failed.
  3. The heartbeat goes to status='error' with "WRITE FAILED" and the first
     error text in `detail` whenever a write fails. The dashboard already
     reads that row, so a silent write failure now shows up on screen
     instead of scrolling past in a console.

Cadence deliberately UNCHANGED. Once the trigger was fixed, ppp rows came
back to ~4 minutes fresh with FULL_REFRESH_EVERY_N_CYCLES=60, so there was
no cadence problem to fix -- only a write problem that looked like one.

CONFIG moved to environment variables (see .env.example). VendoMonitor is a
PUBLIC repo: no credential may ever appear in this file again.
--------------------------------------------------------------------
"""

import os
import sys
import time
import socket
import json
import traceback
from datetime import datetime, timezone

# -- Third-party deps (install once: pip install routeros-api requests) --
try:
    import routeros_api
except ImportError:
    print("Missing dependency. Run:  pip install routeros-api requests")
    sys.exit(1)

import urllib.request
import urllib.error


# ====================================================================
#  CONFIG  -- values come from .env, loaded by spawn_poller_launcher.py
# ====================================================================
def _cfg(name, default=None, required=True):
    """Read config from the environment. The launcher loads .env before exec.

    This file is committed to a PUBLIC repo, so a missing value must be a
    hard stop rather than a silent fallback to some baked-in default.
    """
    v = os.environ.get(name, default)
    if required and (v is None or v == ""):
        raise SystemExit(
            f"missing config: {name}\n"
            f"add it to the .env next to spawn_poller_launcher.py"
        )
    return v


def _cfg_int(name, default):
    try:
        return int(os.environ.get(name) or default)
    except (TypeError, ValueError):
        return default


MIKROTIK_HOST     = _cfg("MIKROTIK_HOST", "192.168.40.1")
MIKROTIK_USER     = _cfg("MIKROTIK_USER")
MIKROTIK_PASS     = _cfg("MIKROTIK_PASS")
MIKROTIK_PORT     = _cfg_int("MIKROTIK_PORT", 8728)
PLAINTEXT_LOGIN   = (os.environ.get("MIKROTIK_PLAINTEXT_LOGIN", "true").lower()
                     != "false")

# Name of THIS server. A poller on another MikroTik must use a different
# SERVER_NAME (e.g. "Sindangan Server") or the two will overwrite each other.
SERVER_NAME       = _cfg("SERVER_NAME", "Dicayas Server")

SUPABASE_URL      = _cfg("SUPABASE_URL", "https://cviraqfhphhsonjmrtvu.supabase.co")
# The anon key. RLS IS now enabled (Aug 2026) and this key is genuinely
# limited by policy -- the v15 comment claiming otherwise was stale and was
# what made the RLS-driven write failure so hard to spot.
SUPABASE_KEY      = _cfg("SUPABASE_KEY")

POLL_SECONDS      = _cfg_int("POLL_SECONDS", 30)
SERVICE_NAME      = "mikrotik_status_poller"     # heartbeat row id
HOSTNAME          = socket.gethostname()
# Set by the launcher so the heartbeat says which build is live.
BUILD             = os.environ.get("SPAWN_POLLER_VERSION", "local")

# Traffic-snapshot settings (v7 logic)
SNAPSHOT_GAP_SEC  = _cfg_int("SNAPSHOT_GAP_SEC", 3)
NOISE_BYTES       = _cfg_int("NOISE_BYTES", 1000)

# v13: VLAN offset per second octet, used ONLY when a lease has no usable
# DHCP server ("all"). 10.0.N.10 -> vlanN, 10.1.N.10 -> vlan(200+N).
IP_VLAN_OFFSETS   = {"0": 0, "1": 200}

# Delta-writes: only upsert rows that actually changed. Every Nth cycle we
# write everything anyway, so updated_at never goes stale on a machine whose
# state genuinely never changes. At 30s cycles, 60 = a full refresh every 30 min.
FULL_REFRESH_EVERY_N_CYCLES = _cfg_int("FULL_REFRESH_EVERY_N_CYCLES", 60)

# Freewifi voucher pull
VOUCHER_PROFILE        = os.environ.get("VOUCHER_PROFILE", "freewifi")
VOUCHER_EVERY_N_CYCLES = _cfg_int("VOUCHER_EVERY_N_CYCLES", 6)


# ====================================================================
#  Supabase helpers (plain urllib -- no extra deps)
# ====================================================================
# v16: every failure lands here as well as on stdout. Cleared once per cycle
# by the main loop, then folded into the heartbeat. This list is the entire
# reason the two-month ppp outage would now be visible within 30 seconds.
_SB_ERRORS = []


def _note_error(msg):
    print(f"[SB ERROR] {msg}")
    if len(_SB_ERRORS) < 20:          # bound it; the first few are enough
        _SB_ERRORS.append(msg)


def _sb_request(method, path, payload=None, prefer=None, extra_headers=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        # The body carries the real cause (PGRST102, 42501, policy violation).
        # Truncate hard -- this ends up in a heartbeat column.
        try:
            detail = e.read().decode()[:300]
        except Exception:
            detail = ""
        _note_error(f"{method} {path.split('?')[0]} -> {e.code}: {detail}")
        return None
    except Exception as e:
        _note_error(f"{method} {path.split('?')[0]} -> {type(e).__name__}: {e}")
        return None


def sb_get_all(path, page=1000):
    """GET every row of `path`, paging with Range headers.

    PostgREST hard-caps a response at 1000 rows regardless of any limit=
    parameter. Returns None if ANY page fails, so callers can tell a broken
    fetch from a genuinely empty result.
    """
    out = []
    start = 0
    while True:
        rows = _sb_request("GET", path, extra_headers={
            "Range-Unit": "items",
            "Range": f"{start}-{start + page - 1}",
        })
        if rows is None:
            return None
        out.extend(rows)
        if len(rows) < page:
            return out
        start += page
        if start > 200000:          # sanity stop, should never trigger
            return out


def sb_upsert(table, rows, on_conflict):
    """Bulk upsert with conflict resolution. Returns (sent, failed_chunks).

    PostgREST requires every object in a batch to have an IDENTICAL set of
    keys. Vendo rows carry router_comment/user_count/rx_bytes/tx_bytes while
    ppp rows carry ppp_profile/ppp_comment/ppp_disabled -- a mixed batch is
    rejected with PGRST102. We (1) build the union of all keys and pad missing
    with None so all rows share one shape, and (2) chunk at 200 rows.

    v16: the failure count is RETURNED rather than discarded. A failing chunk
    takes all 200 of its rows down with it, so "some rows are stale" is a
    write failure until proven otherwise.
    """
    if not rows:
        return 0, 0
    all_keys = set()
    for r in rows:
        all_keys.update(r.keys())
    norm = [{k: r.get(k, None) for k in all_keys} for r in rows]
    path = f"{table}?on_conflict={on_conflict}"
    failed = 0
    for i in range(0, len(norm), 200):
        chunk = norm[i:i + 200]
        before = len(_SB_ERRORS)
        _sb_request("POST", path, payload=chunk,
                    prefer="resolution=merge-duplicates,return=minimal")
        if len(_SB_ERRORS) > before:
            failed += 1
    return len(norm), failed


def write_heartbeat(status, detail, cycle):
    """Write/refresh the heartbeat row so the dashboard knows we're alive.
    NOTE: with delta-writes enabled, mikrotik_status.updated_at no longer
    advances every cycle -- THIS heartbeat is the poller-liveness signal."""
    now = datetime.now(timezone.utc).isoformat()
    row = [{
        "service_name": SERVICE_NAME,
        "last_beat": now,
        "status": status,
        "hostname": HOSTNAME,
        "server_name": SERVER_NAME,
        "detail": detail[:500],
        "cycle_count": cycle,
        "updated_at": now,
    }]
    # Deliberately bypasses the error bookkeeping: if the heartbeat itself is
    # what's failing, appending to _SB_ERRORS here would just recurse into the
    # next cycle's detail string.
    sb_upsert("system_heartbeat", row, "service_name")


# ====================================================================
#  Delta-write: only send rows whose meaningful fields actually changed
# ====================================================================
# Volatile fields excluded from the comparison -- they change every cycle
# by nature and would defeat the whole point.
# offline_since is here because it only ever changes when `online` changes,
# and `online` IS compared. Without this, the cycle that omits offline_since
# (history unavailable) would look like every single row changed.
#
# ppp_profile / ppp_comment / ppp_disabled are deliberately NOT in this set.
# A subscriber moving from "20M" to "20k" is exactly the change we want
# written the moment it happens.
_IGNORE_ON_COMPARE = {"updated_at", "last_seen", "traffic_delta",
                      "rx_bps", "tx_bps", "rx_bytes", "tx_bytes",
                      "offline_since"}

_BPS_CHANGE_MIN   = 200000       # 0.2 Mbps swing counts as a real change
_BYTES_CHANGE_MIN = 5_000_000    # 5 MB of new traffic counts as a change


def _sig(row):
    """Comparable signature of a row: everything except volatile fields."""
    return tuple(sorted(
        (k, v) for k, v in row.items() if k not in _IGNORE_ON_COMPARE
    ))


def changed_rows(new_rows, prev_sig, key_field, force_all=False):
    """Return (rows_to_write, new_signature_map)."""
    out = []
    sigs = {}
    for r in new_rows:
        k = r.get(key_field)
        if k is None:
            continue
        sig = _sig(r)
        prev = prev_sig.get(k)
        sigs[k] = (sig,
                   int(r.get("rx_bps") or 0) + int(r.get("tx_bps") or 0),
                   int(r.get("rx_bytes") or 0) + int(r.get("tx_bytes") or 0))
        if force_all or prev is None or prev[0] != sig:
            out.append(r)
            continue
        bps_now = sigs[k][1]
        byt_now = sigs[k][2]
        if abs(bps_now - prev[1]) >= _BPS_CHANGE_MIN:
            out.append(r)
            continue
        if abs(byt_now - prev[2]) >= _BYTES_CHANGE_MIN:
            out.append(r)
    return out, sigs


# ====================================================================
#  MikroTik polling
# ====================================================================
def get_suppress_set():
    """Load suppressed vlans / ppp_names so we skip noise."""
    rows = _sb_request("GET", "mikrotik_suppress?select=vlan,ppp_name") or []
    vlans = set()
    ppps = set()
    for r in rows:
        if r.get("vlan"):
            vlans.add(str(r["vlan"]))
        if r.get("ppp_name"):
            ppps.add(str(r["ppp_name"]))
    return vlans, ppps


def fetch_previous_state(retries=2):
    """Load existing online/offline + offline_since so we can preserve when
    each machine first went offline.

    Returns None if the fetch FAILED. An empty dict means the table really is
    empty. The caller MUST tell these apart -- v13 treated a failed fetch as
    "no history" and stamped every offline machine with the current time.
    """
    for attempt in range(retries + 1):
        rows = sb_get_all("mikrotik_status?select=match_key,online,offline_since")
        if rows is not None:
            return {r["match_key"]: r for r in rows if r.get("match_key")}
        if attempt < retries:
            print(f"[{datetime.now()}] prev-state fetch failed, "
                  f"retry {attempt+1}/{retries}")
            time.sleep(2)
    return None


def _iface_snapshot(api):
    """Map vlanNNN -> (rx_byte, tx_byte) for byte-delta comparison."""
    snap = {}
    for it in api.get_resource("/interface").get():
        name = it.get("name", "")
        if not name.startswith("vlan"):
            continue
        try:
            snap[name] = (int(it.get("rx-byte") or 0), int(it.get("tx-byte") or 0))
        except (ValueError, TypeError):
            snap[name] = (0, 0)
    return snap


def poll_mikrotik(prev_state):
    """
    Read:
      1. DHCP leases -> vendo lease status/notes + customer devices
      2. VLAN interfaces -> vendo name (comment) + total bytes
      3. Two interface snapshots -> live byte movement
      4. PPP secrets + active -> SUBSCRIBERS, including the billing profile

    Returns (rows, device_rows, stats).
    """
    conn = routeros_api.RouterOsApiPool(
        MIKROTIK_HOST,
        username=MIKROTIK_USER,
        password=MIKROTIK_PASS,
        port=MIKROTIK_PORT,
        plaintext_login=PLAINTEXT_LOGIN,
    )
    api = conn.get_api()
    try:
        leases  = api.get_resource("/ip/dhcp-server/lease").get()
        secrets = api.get_resource("/ppp/secret").get()
        active  = api.get_resource("/ppp/active").get()
        # DHCP server -> interface mapping. This is the primary way to know
        # which VLAN a lease belongs to. Do NOT blindly infer it from the IP
        # octets: 10.1.10.x belongs to vlan210, not vlan10.
        dhcp_srv = api.get_resource("/ip/dhcp-server").get()

        # Two interface snapshots to detect live byte movement (v7 logic).
        snap1 = _iface_snapshot(api)
        time.sleep(SNAPSHOT_GAP_SEC)
        ifaces = api.get_resource("/interface").get()
        snap2 = {}
        for it in ifaces:
            nm = it.get("name", "")
            if nm.startswith("vlan"):
                try:
                    snap2[nm] = (int(it.get("rx-byte") or 0),
                                 int(it.get("tx-byte") or 0))
                except (ValueError, TypeError):
                    snap2[nm] = (0, 0)
    finally:
        conn.disconnect()

    now = datetime.now(timezone.utc).isoformat()
    rows = []

    # -- DHCP server name -> VLAN, straight from the router ----------
    srv_to_vlan = {}
    for d in dhcp_srv:
        nm = d.get("name")
        iface = d.get("interface") or ""
        if nm and iface.startswith("vlan") and iface[4:].isdigit():
            srv_to_vlan[nm] = iface[4:]

    # -- v13: VLANs that actually exist on this router ----------------
    known_vlans = set()
    for it in ifaces:
        nm = it.get("name", "")
        if nm.startswith("vlan") and nm[4:].isdigit():
            known_vlans.add(nm[4:])

    def derive_vlan_from_ip(ip):
        """FALLBACK ONLY -- for leases whose DHCP server is "all". Restricted
        to the vendo's own .10 host and to VLANs that exist as real
        interfaces."""
        p = (ip or "").split(".")
        if len(p) != 4 or p[0] != "10" or p[3] != "10":
            return None
        if not p[2].isdigit():
            return None
        base = IP_VLAN_OFFSETS.get(p[1])
        if base is None:
            return None
        v = str(int(p[2]) + base)
        return v if v in known_vlans else None

    def lease_vlan(ls):
        """VLAN this lease belongs to, via its DHCP server. None if unknown.
        Used for CUSTOMER leases -- no IP guessing here, a wrong VLAN would
        inflate someone else's user_count."""
        return srv_to_vlan.get(ls.get("server"))

    # -- Vendo's OWN lease: the .10 host on its VLAN -----------------
    vendo_lease_status = {}
    vendo_lease_note   = {}
    vendo_lease_mac    = {}
    vendo_lease_ip     = {}
    vendo_lease_src    = {}     # vlan -> "server" | "ip"
    srv_all_recovered  = 0
    for ls in leases:
        ip = (ls.get("address") or "")
        p = ip.split(".")
        if len(p) != 4 or p[3] != "10":
            continue                      # not a vendo host lease
        v = srv_to_vlan.get(ls.get("server"))
        src = "server"
        if v is None:
            v = derive_vlan_from_ip(ip)   # server was "all" or unrecognised
            src = "ip"
        if v is None:
            continue
        # The authoritative server mapping always wins.
        if src == "ip" and vendo_lease_src.get(v) == "server":
            continue
        if src == "ip":
            srv_all_recovered += 1
        vendo_lease_src[v] = src
        vendo_lease_status[v] = (ls.get("status") or "").lower() or None
        vendo_lease_ip[v] = ip
        note = ls.get("comment")
        if note and note.strip():
            vendo_lease_note[v] = note.strip()
        if ls.get("mac-address"):
            vendo_lease_mac[v] = ls.get("mac-address")

    # -- Customer devices: every OTHER lease on that VLAN ------------
    users_per_vlan = {}
    device_rows = []
    for ls in leases:
        v = lease_vlan(ls)
        if v is None:
            continue
        ip = (ls.get("address") or "")
        p = ip.split(".")
        if len(p) == 4 and p[3] == "10":
            continue                      # that's the vendo itself
        st = (ls.get("status") or "").lower()
        if st == "bound":
            users_per_vlan[v] = users_per_vlan.get(v, 0) + 1
        mac = ls.get("mac-address")
        if mac:
            device_rows.append({
                "server_name": SERVER_NAME,
                "vlan": v,
                "mac": mac,
                "ip": ip,
                "hostname": ls.get("host-name") or None,
                "lease_status": st or None,
                "expires_after": ls.get("expires-after") or None,
                "last_seen": now,
                "updated_at": now,
            })

    def traffic_delta(vlan):
        a = snap1.get("vlan" + vlan)
        b = snap2.get("vlan" + vlan)
        if not a or not b:
            return 0
        return max(0, b[0] - a[0]) + max(0, b[1] - a[1])

    def live_bps(vlan):
        """Live speed in bits/sec, computed from the two snapshots."""
        a = snap1.get("vlan" + vlan)
        b = snap2.get("vlan" + vlan)
        if not a or not b or SNAPSHOT_GAP_SEC <= 0:
            return (0, 0)
        rx = int(max(0, b[0] - a[0]) * 8 / SNAPSHOT_GAP_SEC)
        tx = int(max(0, b[1] - a[1]) * 8 / SNAPSHOT_GAP_SEC)
        return (rx, tx)

    # When the history fetch failed, prev_state is None. In that case we do NOT
    # write offline_since at all -- see the v14 note in the module docstring.
    track_offline = prev_state is not None

    def compute_offline_since(match_key, online):
        if online:
            return None
        prev = prev_state.get(match_key)
        if prev and prev.get("offline_since"):
            return prev["offline_since"]
        return now

    # -- 1. VENDOS ---------------------------------------------------
    for it in ifaces:
        name = it.get("name", "")
        if not name.startswith("vlan"):
            continue
        vlan = name[4:]
        if not vlan.isdigit():
            continue

        disabled = (it.get("disabled") == "true")
        lease_status = vendo_lease_status.get(vlan)
        delta = traffic_delta(vlan)
        rx_bps, tx_bps = live_bps(vlan)
        live = delta > 0
        has_users = users_per_vlan.get(vlan, 0) > 0

        # ONLINE = lease bound OR live byte movement OR customers connected.
        online = (not disabled) and ((lease_status == "bound") or live or has_users)

        # Tiny movement with no lease is probably ARP/keepalive noise.
        is_noise = (lease_status != "bound") and live and (delta <= NOISE_BYTES)

        online_via = ("lease" if lease_status == "bound"
                      else ("users" if has_users
                            else ("traffic" if live else None)))

        comment = it.get("comment") or None
        try:
            rxb = int(it.get("rx-byte") or 0)
            txb = int(it.get("tx-byte") or 0)
        except (ValueError, TypeError):
            rxb = txb = 0

        vrow = {
            "kind": "vendo",
            "ppp_name": None,
            "vlan": vlan,
            "online": online,
            "last_seen": now if online else None,
            "ip": vendo_lease_ip.get(vlan),
            "mac": vendo_lease_mac.get(vlan),
            "match_key": vlan,
            "server_name": SERVER_NAME,
            "router_comment": comment,
            "user_count": users_per_vlan.get(vlan, 0),
            "rx_bytes": rxb,
            "tx_bytes": txb,
            "rx_bps": rx_bps,
            "tx_bps": tx_bps,
            "lease_status": lease_status,
            "lease_note": vendo_lease_note.get(vlan),
            "online_via": online_via,
            "traffic_delta": delta,
            "maybe_noise": is_noise,
            "updated_at": now,
        }
        if track_offline:
            vrow["offline_since"] = compute_offline_since(vlan, online)
        rows.append(vrow)

    # -- 2. SUBSCRIBERS from PPP secrets + active --------------------
    active_by_name = {a.get("name"): a for a in active if a.get("name")}
    cutoff_count = 0
    for s in secrets:
        name = s.get("name")
        if not name:
            continue
        sess = active_by_name.get(name)
        online = sess is not None
        ip = (sess or {}).get("address") if sess else None
        mkey = f"ppp:{name}"

        # The secret's Profile IS the billing state on this network.
        #   "20k"                 -> throttled  => CUT OFF (still "online"!)
        #   "20M" / "25M" / "50M" -> paying at that speed
        profile  = (s.get("profile") or "").strip() or None
        scomment = (s.get("comment") or "").strip() or None
        sdisabled = str(s.get("disabled", "false")).lower() == "true"
        if profile and profile.rstrip().lower().endswith("k"):
            cutoff_count += 1

        prow = {
            "kind": "ppp",
            "ppp_name": name,
            "vlan": None,
            "online": online,
            "last_seen": now if online else None,
            "ip": ip,
            "mac": (sess or {}).get("caller-id") if sess else None,
            "match_key": mkey,
            "server_name": SERVER_NAME,
            # NOTE: mikrotik_status.service_state is GENERATED ALWAYS from
            # these three plus `online`. Never write service_state from here.
            "ppp_profile": profile,
            "ppp_comment": scomment,
            "ppp_disabled": sdisabled,
            "updated_at": now,
        }
        if track_offline:
            prow["offline_since"] = compute_offline_since(mkey, online)
        rows.append(prow)

    return rows, device_rows, {"srv_all_recovered": srv_all_recovered,
                               "offline_tracked": track_offline,
                               "cutoff_count": cutoff_count}


# ====================================================================
#  Freewifi voucher pull  (includes voucher CODE / password)
# ====================================================================
def poll_freewifi_vouchers():
    """Pull hotspot users on the freewifi profile. Own short connection so
    it never interferes with poll_mikrotik. Name format: vlan<NNN><suffix>."""
    conn = routeros_api.RouterOsApiPool(
        MIKROTIK_HOST,
        username=MIKROTIK_USER,
        password=MIKROTIK_PASS,
        port=MIKROTIK_PORT,
        plaintext_login=PLAINTEXT_LOGIN,
    )
    api = conn.get_api()
    try:
        users = api.get_resource("/ip/hotspot/user").get()
    finally:
        conn.disconnect()

    now = datetime.now(timezone.utc).isoformat()
    out = []
    for u in users:
        if u.get("profile") != VOUCHER_PROFILE:
            continue
        name = u.get("name") or ""
        if not name.lower().startswith("vlan"):
            continue
        digits = ""
        for ch in name[4:]:
            if ch.isdigit():
                digits += ch
            else:
                break
        if not digits:
            continue
        out.append({
            "server_name": SERVER_NAME,
            "vlan": digits,
            "username": name,
            "voucher_code": u.get("password") or None,
            "profile": VOUCHER_PROFILE,
            "last_seen": now,
            "updated_at": now,
        })
    return out


def match_vouchers_to_vendos():
    """Server-side safe match: fills vendo_id only where (server,vlan) -> 1 vendo.
    Never writes vendos. No-op if the RPC is absent."""
    _sb_request("POST", "rpc/match_hotspot_vouchers", payload={})


# ====================================================================
#  Main loop
# ====================================================================
def main():
    print(f"[{datetime.now()}] SPAWN MikroTik poller v16 ({BUILD}) on {HOSTNAME}")
    print(f"  Router: {MIKROTIK_HOST}:{MIKROTIK_PORT}  Poll: {POLL_SECONDS}s")
    write_heartbeat("starting", f"Poller v16 build {BUILD} started", 0)
    cycle = 0
    status_sig = {}     # match_key -> signature tuple
    device_sig = {}     # server|vlan|mac -> signature tuple

    while True:
        cycle += 1
        start = time.time()
        del _SB_ERRORS[:]          # v16: per-cycle error slate
        try:
            full = (cycle % FULL_REFRESH_EVERY_N_CYCLES == 0) or (cycle == 1)
            sup_vlans, sup_ppps = get_suppress_set()
            prev_state = fetch_previous_state()
            rows, device_rows, stats = poll_mikrotik(prev_state)
            rows = [r for r in rows
                    if not (r.get("kind") == "vendo" and str(r.get("vlan")) in sup_vlans)
                    and not (r.get("kind") == "ppp" and r.get("ppp_name") in sup_ppps)]

            # -- DELTA WRITE: only send rows that actually changed --
            to_write, status_sig = changed_rows(rows, status_sig, "match_key",
                                                force_all=full)
            _, status_failed = sb_upsert("mikrotik_status", to_write, "match_key")

            # -- Per-device detail (isolated + non-fatal) --
            d_count = 0
            d_total = 0
            dev_failed = 0
            try:
                device_rows = [d for d in device_rows
                               if str(d.get("vlan")) not in sup_vlans]
                for d in device_rows:
                    d["_k"] = f"{d['server_name']}|{d['vlan']}|{d['mac']}"
                d_total = len(device_rows)
                d_write, device_sig = changed_rows(device_rows, device_sig, "_k",
                                                   force_all=full)
                for d in d_write:
                    d.pop("_k", None)
                _, dev_failed = sb_upsert("vendo_devices", d_write,
                                          "server_name,vlan,mac")
                d_count = len(d_write)
            except Exception as de:
                print(f"[{datetime.now()}] device upsert failed (non-fatal): "
                      f"{type(de).__name__}: {de}")

            # -- Freewifi voucher pull (isolated + non-fatal) --
            v_count = 0
            if cycle % VOUCHER_EVERY_N_CYCLES == 0:
                try:
                    vrows = poll_freewifi_vouchers()
                    sb_upsert("hotspot_vouchers", vrows,
                              "server_name,vlan,username")
                    match_vouchers_to_vendos()
                    v_count = len(vrows)
                except Exception as ve:
                    print(f"[{datetime.now()}] voucher pull failed (non-fatal): "
                          f"{type(ve).__name__}: {ve}")

            vendos = [r for r in rows if r["kind"] == "vendo"]
            ppps = [r for r in rows if r["kind"] == "ppp"]
            v_on = sum(1 for r in vendos if r["online"])
            p_on = sum(1 for r in ppps if r["online"])
            waiting = sum(1 for r in vendos if r.get("lease_status") == "waiting")
            nolease = sum(1 for r in vendos if not r.get("lease_status"))
            total_users = sum(r.get("user_count", 0) for r in vendos)
            total_mbps = sum(r.get("rx_bps", 0) + r.get("tx_bps", 0)
                             for r in vendos) / 1000000.0
            recovered = stats.get("srv_all_recovered", 0)
            cutoffs = stats.get("cutoff_count", 0)
            no_hist = not stats.get("offline_tracked", True)

            # v16: a failed write is now the HEADLINE of the heartbeat, not a
            # console line. Two months of frozen ppp rows is what the old
            # behaviour cost.
            failed_chunks = status_failed + dev_failed
            if failed_chunks:
                first = _SB_ERRORS[0] if _SB_ERRORS else "unknown"
                detail = (f"WRITE FAILED - {failed_chunks} chunk(s) rejected "
                          f"(~{failed_chunks * 200} rows did not save) - "
                          f"{first}")
                write_heartbeat("error", detail, cycle)
                print(f"[{datetime.now()}] cycle {cycle}: {detail}")
            else:
                detail = (f"OK - {len(vendos)} vendos ({v_on} on, {waiting} waiting, "
                          f"{nolease} no-lease) - {len(ppps)} subs ({p_on} on, "
                          f"{cutoffs} cutoff) - "
                          f"{total_users} customers ({d_total} devices) - "
                          f"{total_mbps:.1f} Mbps - {v_count} vouchers - "
                          f"wrote {len(to_write)}/{len(rows)} status, "
                          f"{d_count}/{d_total} devices"
                          f"{f' - {recovered}x srv=all' if recovered else ''}"
                          f"{' - WARN offline_since held (no history)' if no_hist else ''}"
                          f"{' [FULL]' if full else ''} - b{BUILD}")
                write_heartbeat("running", detail, cycle)
                print(f"[{datetime.now()}] cycle {cycle}: {detail} "
                      f"({time.time()-start:.1f}s)")

        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            print(f"[{datetime.now()}] ERROR cycle {cycle}: {err}")
            traceback.print_exc()
            write_heartbeat("error", err[:200], cycle)

        elapsed = time.time() - start
        time.sleep(max(1, POLL_SECONDS - elapsed))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped by user.")
        write_heartbeat("stopped", "Manual stop (KeyboardInterrupt)", -1)
