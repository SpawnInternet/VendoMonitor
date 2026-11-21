# SpawnFi reader (Railway) — read only

Reads each SpawnFi router every 90 s through the WireGuard hub and fills `spawnfi_status` in Supabase
(boards down from `/tool/netwatch`, PPPoE accounts from `/ppp/secret` + `/ppp/active`). Spawn Jobs shows
them as the SpawnFi waiting list and inactive PPPoE. It never writes to a router.

Railway variables (set in Railway, never in this public repo):

| Variable | What |
|---|---|
| `ROUTERS` | JSON list: `[{"name":"Spawnfi-Sindangan","url":"http://10.99.0.x"}]` (no passwords here) |
| `ROUTER_PASS` | Password of the read-only `spawnjobs-ro` user (same on every router). Typed into Railway by the owner only. |
| `ROUTER_USER` | Optional, default `spawnjobs-ro` |
| `READER_TOKEN` | must match the `spawnfi_reader_token` secret in Supabase Vault |
| `SUPABASE_KEY` | the project's publishable key |
| `WG_PRIVATE_KEY`, `WG_ADDRESS` | this reader's WireGuard key and its 10.99.x.x/32 address |
| `WG_PEER_PUBLIC_KEY`, `WG_ENDPOINT` | the hub's public key and public address:port |
| `WG_ALLOWED_IPS` | default `10.99.0.0/16` (add management subnets if a router sits behind the hub's LAN) |
| `INTERVAL_SEC` | default 90 |

On each router (owner pastes; read-only):
```
/user group add name=spawnjobs-ro policy=read,rest-api,api,!write,!policy,!sensitive
/user add name=spawnjobs-ro group=spawnjobs-ro password=<strong password> address=<reader WG address>
/ip service set www address=<existing list>,<reader WG address>
```
