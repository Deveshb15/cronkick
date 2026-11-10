#!/usr/bin/env bash
# Rolling deploy: update one droplet at a time and wait until it's healthy, so a server is always firing.
# Usage: deploy/push.sh <ip> [<ip> ...]
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -gt 0 ] || { echo "usage: deploy/push.sh <droplet ip> [...]"; exit 1; }
for host in "$@"; do
  echo "==> $host"
  rsync -az --delete --exclude node_modules --exclude .git --exclude test --exclude docs --exclude .env ./ "root@$host:/opt/ontime/"
  ssh "root@$host" 'set -e
    cd /opt/ontime && chown -R ontime:ontime . && sudo -u ontime npm ci --omit=dev --silent
    cp deploy/ontime.service /etc/systemd/system/ontime.service && systemctl daemon-reload
    test -f /etc/ontime/env || { echo "missing /etc/ontime/env"; exit 1; }
    systemctl enable ontime >/dev/null 2>&1; systemctl restart ontime
    for i in $(seq 1 30); do curl -fs localhost:3000/healthz >/dev/null && echo healthy && exit 0; sleep 1; done
    journalctl -u ontime -n 50 --no-pager; exit 1'
done
