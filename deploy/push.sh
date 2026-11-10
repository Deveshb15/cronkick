#!/usr/bin/env bash
# Rolling deploy: update one droplet at a time and wait until it's healthy, so a server is always firing.
# Usage: deploy/push.sh <ip> [<ip> ...]
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -gt 0 ] || { echo "usage: deploy/push.sh <droplet ip> [...]"; exit 1; }
for host in "$@"; do
  echo "==> $host"
  # Only files tracked in git: local secrets (.env.production, *.pem) never leave this machine.
  git ls-files | grep -v -E '^(test|docs|probe)/' | rsync -az --files-from=- ./ "root@$host:/opt/cronkick/"
  ssh "root@$host" 'set -e
    cd /opt/cronkick && chown -R cronkick:cronkick . && sudo -u cronkick npm ci --omit=dev --silent
    cp deploy/cronkick.service /etc/systemd/system/cronkick.service && systemctl daemon-reload
    test -f /etc/cronkick/env || { echo "missing /etc/cronkick/env"; exit 1; }
    systemctl enable cronkick >/dev/null 2>&1; systemctl restart cronkick
    for i in $(seq 1 30); do curl -fs localhost:3000/healthz >/dev/null && echo healthy && exit 0; sleep 1; done
    journalctl -u cronkick -n 50 --no-pager; exit 1'
done
