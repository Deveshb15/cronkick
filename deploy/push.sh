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
    cd /opt/cronkick && chown -R cronkick:cronkick .
    sudo -u cronkick npm ci --silent
    sudo -u cronkick node_modules/.bin/next build web >/tmp/next-build.log 2>&1 || { tail -30 /tmp/next-build.log; exit 1; }
    cp deploy/cronkick.service deploy/cronkick-web.service /etc/systemd/system/ && systemctl daemon-reload
    test -f /etc/cronkick/env || { echo "missing /etc/cronkick/env"; exit 1; }
    systemctl enable cronkick cronkick-web >/dev/null 2>&1
    systemctl restart cronkick cronkick-web
    for i in $(seq 1 40); do
      if curl -fs localhost:3000/healthz >/dev/null && curl -fs -o /dev/null localhost:3000/; then echo healthy; exit 0; fi
      sleep 1
    done
    journalctl -u cronkick -u cronkick-web -n 50 --no-pager; exit 1'
done
