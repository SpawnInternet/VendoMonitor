#!/bin/sh
# Start userspace WireGuard (wireproxy -> SOCKS5 on 127.0.0.1:1080) when WG_* is set, then the reader.
set -e
if [ -n "$WG_PRIVATE_KEY" ]; then
  umask 077
  cat > /tmp/wg.conf <<CONF
[Interface]
Address = ${WG_ADDRESS}
PrivateKey = ${WG_PRIVATE_KEY}
MTU = ${WG_MTU:-1380}

[Peer]
PublicKey = ${WG_PEER_PUBLIC_KEY}
Endpoint = ${WG_ENDPOINT}
AllowedIPs = ${WG_ALLOWED_IPS:-10.99.0.0/16}
PersistentKeepalive = 25

[Socks5]
BindAddress = 127.0.0.1:1080
CONF
  wireproxy -c /tmp/wg.conf &
  sleep 3
fi
exec node index.js
