#!/usr/bin/env bash
# Deploy from a laptop with the same steps CI runs (merging to main is the normal way):
# build here, upload to every server, migrate once, then go live one server at a time.
# Usage: deploy/push.sh <ip> [<ip> ...]
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -gt 0 ] || { echo "usage: deploy/push.sh <droplet ip> [...]"; exit 1; }
id="$(git rev-parse --short HEAD)-$(date +%s)"
# The build must use the servers' Server Actions key, so a form rendered by one server works on the other.
export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:-$(ssh "root@$1" "grep '^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=' /etc/cronkick/env | cut -d= -f2-")}"
deploy/release.sh build "$id"
for h in "$@"; do deploy/release.sh upload "$h" "$id"; done
deploy/release.sh migrate "$1" "$id"
for h in "$@"; do deploy/release.sh live "$h" "$id"; done
