#!/usr/bin/env python3
"""
Spawn Poller — one-time publish helper.

Run this ONCE on the poller box. It takes the poller script that currently
exists only on this machine and gets it into GitHub, so it can be reviewed and
changed by pushing instead of by pasting through remote desktop.

It does three things:

  1. FINDS the existing poller script.
  2. SPLITS secrets out of it -- every hardcoded credential is replaced with an
     os.environ lookup, and the real values are written to a local .env. You do
     not have to retype anything, and the code becomes safe to publish.
  3. Optionally PUSHES the cleaned copy to GitHub.

VendoMonitor is a PUBLIC repo. Nothing here uploads .env, and the script
refuses to push if it still finds something that looks like a live credential.

USAGE
  python bootstrap_publish.py --find
  python bootstrap_publish.py --file "C:\\path\\to\\mikrotik_status_poller.py"
  python bootstrap_publish.py --file "...\\poller.py" --push

With --push you are prompted for a GitHub token. It is used for the single API
call and never written to disk.
"""

import argparse
import base64
import getpass
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

REPO   = "SpawnInternet/VendoMonitor"
BRANCH = "main"
DEST   = "poller/mikrotik_status_poller.py"

SEARCH_DIRS = [
    r"C:\SpawnPoller", r"C:\Spawn", r"C:\poller", r"C:\Scripts",
    r"C:\Users\Public", os.path.expanduser("~"), r"C:\\",
]
NAME_HINTS = ("mikrotik", "poller", "spawn")

# Each rule: (label, env var, regex). Every regex exposes a 'pre' group (the
# part that must survive, e.g. `password = `) and a 'val' group (the literal to
# extract). Without 'pre', `username = "admin"` would collapse to a bare
# _cfg(...) call and the variable would vanish -- a NameError at runtime.
# Ordered most-specific first so a service key is not caught by the password rule.
SECRET_RULES = [
    ("supabase service key", "SUPABASE_SERVICE_KEY",
     re.compile(r"""(?P<pre>)(?P<q>['"])(?P<val>eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)(?P=q)""")),
    ("supabase url", "SUPABASE_URL",
     re.compile(r"""(?P<pre>)(?P<q>['"])(?P<val>https://[a-z0-9]+\.supabase\.co)(?P=q)""")),
    ("mikrotik host", "MIKROTIK_HOST",
     re.compile(r"""(?P<pre>)(?P<q>['"])(?P<val>(?:192\.168|10\.|172\.(?:1[6-9]|2\d|3[01]))[0-9.]+)(?P=q)""")),
    ("password", "MIKROTIK_PASS",
     re.compile(r"""(?P<pre>(?i:password|passwd|pwd|mt_pass)\s*=\s*)(?P<q>['"])(?P<val>[^'"]{3,})(?P=q)""")),
    ("username", "MIKROTIK_USER",
     re.compile(r"""(?P<pre>(?i:username|user|mt_user)\s*=\s*)(?P<q>['"])(?P<val>[^'"]{2,})(?P=q)""")),
]

ENV_SHIM = '''
# ---------------------------------------------------------------------------
# Credentials moved out of this file by bootstrap_publish.py.
# Values now live in .env next to the launcher, which is gitignored.
# This repo is public: never put a real value back in here.
# ---------------------------------------------------------------------------
import os as _os

def _cfg(name, default=None, required=True):
    v = _os.environ.get(name, default)
    if required and not v:
        raise SystemExit(f"missing {name} -- add it to .env")
    return v

'''


def find_candidates():
    hits = []
    for d in SEARCH_DIRS:
        p = Path(d)
        if not p.is_dir():
            continue
        try:
            depth = 1 if d == r"C:\\" else 3
            for f in p.rglob("*.py"):
                try:
                    if len(f.relative_to(p).parts) > depth:
                        continue
                except ValueError:
                    continue
                if any(h in f.name.lower() for h in NAME_HINTS):
                    hits.append(f)
        except (PermissionError, OSError):
            continue
    # de-duplicate, keep the largest first -- the real poller is not a stub
    uniq = {f.resolve(): f for f in hits}
    return sorted(uniq.values(), key=lambda f: f.stat().st_size, reverse=True)


def sanitise(src: str):
    """Replace literal credentials with _cfg() lookups. Returns (code, env)."""
    env, seen = {}, {}

    def swap(m, envvar):
        val = m.group("val")
        pre = m.group("pre") or ""
        if val in seen:
            return pre + seen[val]
        # first value wins the canonical name; later distinct ones get suffixed
        name = envvar
        n = 2
        while name in env and env[name] != val:
            name = f"{envvar}_{n}"
            n += 1
        env[name] = val
        call = f'_cfg("{name}")'
        seen[val] = call
        return pre + call

    out = src
    for _label, envvar, rx in SECRET_RULES:
        out = rx.sub(lambda m, e=envvar: swap(m, e), out)

    if env:
        lines = out.splitlines(keepends=True)
        i = 0
        if lines and lines[0].startswith("#!"):
            i = 1
        # skip a module docstring if present
        body = "".join(lines[i:]).lstrip()
        if body.startswith(('"""', "'''")):
            q = body[:3]
            end = body.find(q, 3)
            if end != -1:
                consumed = len("".join(lines[i:])) - len(body) + end + 3
                head = "".join(lines[i:])[:consumed]
                rest = "".join(lines[i:])[consumed:]
                return "".join(lines[:i]) + head + "\n" + ENV_SHIM + rest, env
        out = "".join(lines[:i]) + ENV_SHIM + "".join(lines[i:])
    return out, env


def residual_secrets(code: str):
    """Anything that still looks live must block a push to a public repo."""
    bad = []
    if re.search(r"eyJ[A-Za-z0-9_\-]{20,}\.", code):
        bad.append("JWT-looking string")
    if re.search(r"""(?i)\b(?:password|pwd)\s*=\s*['"][^'"]{3,}['"]""", code):
        bad.append("inline password")
    if re.search(r"\bghp_[A-Za-z0-9]{20,}", code):
        bad.append("github token")
    return bad


def push(code: str, token: str):
    api = f"https://api.github.com/repos/{REPO}/contents/{DEST}"
    hdr = {"Authorization": "Bearer " + token, "User-Agent": "spawn-bootstrap",
           "Accept": "application/vnd.github+json", "Content-Type": "application/json"}

    sha = None
    try:
        req = urllib.request.Request(api, headers=hdr)
        sha = json.load(urllib.request.urlopen(req))["sha"]
    except Exception:
        pass

    body = code.encode("utf-8")
    payload = {
        "message": "poller: publish mikrotik_status_poller.py from the poller box\n\n"
                   "Credentials replaced with _cfg() env lookups by "
                   "bootstrap_publish.py; real values written to local .env only.",
        "content": base64.b64encode(body).decode(),
        "branch": BRANCH,
    }
    if sha:
        payload["sha"] = sha

    req = urllib.request.Request(api, method="PUT",
                                 data=json.dumps(payload).encode(), headers=hdr)
    res = json.load(urllib.request.urlopen(req))
    ok = res["content"]["size"] == len(body)
    print(f"  pushed {res['content']['size']}B  size-match={ok}  commit={res['commit']['sha'][:8]}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="path to the existing poller script")
    ap.add_argument("--find", action="store_true", help="search for it")
    ap.add_argument("--push", action="store_true", help="upload to GitHub")
    a = ap.parse_args()

    if a.find or not a.file:
        print("searching for poller scripts...\n")
        for f in find_candidates()[:12]:
            print(f"  {f.stat().st_size:>8}B  {f}")
        print("\nre-run with:  --file \"<path>\"")
        return 0

    src_path = Path(a.file)
    if not src_path.is_file():
        print(f"not found: {src_path}")
        return 2

    original = src_path.read_text(encoding="utf-8", errors="replace")
    print(f"read {src_path}  ({len(original)}B, {original.count(chr(10))+1} lines)\n")

    code, env = sanitise(original)

    if env:
        print("credentials extracted:")
        for k, v in env.items():
            print(f"  {k:26} = {v[:6]}...{v[-4:] if len(v) > 12 else ''}  ({len(v)} chars)")
        envp = src_path.parent / ".env"
        existing = envp.read_text(encoding="utf-8") if envp.exists() else ""
        with envp.open("a", encoding="utf-8") as fh:
            if existing and not existing.endswith("\n"):
                fh.write("\n")
            fh.write("\n# written by bootstrap_publish.py\n")
            for k, v in env.items():
                if f"{k}=" not in existing:
                    fh.write(f"{k}={v}\n")
        print(f"\n  -> written to {envp}   (KEEP THIS OFF GIT)")
    else:
        print("no hardcoded credentials matched -- check by eye before pushing")

    try:
        compile(code, "cleaned", "exec")
        print("\nsyntax check: OK")
    except SyntaxError as e:
        print(f"\nsyntax check FAILED at line {e.lineno}: {e.msg}")
        print("not pushing. send the file to Claude instead.")
        return 3

    out = src_path.parent / "mikrotik_status_poller.cleaned.py"
    out.write_text(code, encoding="utf-8")
    print(f"cleaned copy: {out}")

    residual = residual_secrets(code)
    if residual:
        print("\nREFUSING TO PUSH -- still looks like it contains: " + ", ".join(residual))
        print("open the cleaned copy, move those to .env by hand, then re-run.")
        return 4

    if a.push:
        tok = getpass.getpass("GitHub token (not stored, not echoed): ").strip()
        if not tok:
            print("no token, skipping push")
            return 0
        print(f"\npushing to {REPO}:{DEST}")
        push(code, tok)
    else:
        print("\ndry run. add --push to upload.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
