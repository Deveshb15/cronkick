#!/usr/bin/env bash
# One release, step by step. CI (.github/workflows/ci.yml) runs these; so does deploy/push.sh from a laptop.
# Each release is its own folder, /opt/cronkick/releases/<id>, and /opt/cronkick/current points at the live one,
# so nothing that is serving changes until `live`, and a release that won't come up is switched straight back.
#
#   deploy/release.sh build          <id>   build the site here (needs NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)
#   deploy/release.sh upload  <host> <id>   copy the code and the build to a server and install packages
#   deploy/release.sh migrate <host> <id>   apply new database migrations from that release
#   deploy/release.sh live    <host> <id>   point the server at it, restart, wait until healthy (or switch back)
set -euo pipefail
cd "$(dirname "$0")/.."
step=${1:?step}
if [ "$step" = build ]; then id=${2:?id}; else host=${2:?host} id=${3:?id}; fi
R=/opt/cronkick/releases/$id
remote() { ssh -o BatchMode=yes "root@$host" bash -s -- "$R" "$id"; }

case $step in
build)
  : "${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:?must match the value in /etc/cronkick/env on the servers}"
  # One id for every server, so a browser moving between them behind the load balancer never sees a version change.
  echo "$id" > web/.deployment-id
  node_modules/.bin/next build web
  ;;

upload)
  # Re-running the live release: leave it alone rather than rewrite files it is serving.
  if [ "$(ssh -o BatchMode=yes "root@$host" readlink -f /opt/cronkick/current 2>/dev/null)" = "$R" ]; then echo "$id is already live on $host"; exit 0; fi
  ssh -o BatchMode=yes "root@$host" mkdir -p "$R/web"
  # Only files tracked in git: local secrets (.env.production, *.pem) never leave this machine.
  { git ls-files | grep -v -E '^(test|docs|probe)/'; echo web/.deployment-id; } | rsync -az --files-from=- ./ "root@$host:$R/"
  rsync -az --delete --exclude cache web/.next/ "root@$host:$R/web/.next/"
  remote <<'EOF'
set -euo pipefail
R=$1; C=/opt/cronkick/current
# First release on a server still laid out the old way: the old tree is the live one.
[ -e $C ] || ln -s /opt/cronkick $C
cd "$R"
# Same lockfile as the live release: share its packages (hard links, instant) instead of reinstalling.
if [ ! -d node_modules ] && cmp -s package-lock.json $C/package-lock.json && [ -d $C/node_modules ]; then cp -al $C/node_modules .; fi
chown -R cronkick:cronkick "$R"
[ -d node_modules ] || sudo -u cronkick npm ci --silent --no-audit --no-fund || { rm -rf node_modules; exit 1; }
echo "uploaded to $(hostname)"
EOF
  ;;

migrate)
  remote <<'EOF'
set -euo pipefail
cd "$1" && set -a && . /etc/cronkick/env && set +a
sudo -E -u cronkick node_modules/.bin/tsx scripts/migrate.ts
EOF
  ;;

live)
  remote <<'EOF'
set -euo pipefail
R=$1 ID=$2 C=/opt/cronkick/current
prev=$(readlink -f $C)
point() {
  ln -sfn "$1" $C.next && mv -Tf $C.next $C
  cp "$1"/deploy/cronkick.service "$1"/deploy/cronkick-web.service /etc/systemd/system/
  systemctl daemon-reload && systemctl enable -q cronkick cronkick-web && systemctl restart cronkick cronkick-web
}
# Healthy = the worker and database answer, and the site serves this exact build.
healthy() { for _ in $(seq 1 60); do curl -fs localhost:3000/healthz >/dev/null && curl -fs localhost:3000/ | grep -q "dpl=$1" && return 0; sleep 1; done; return 1; }
# The other server still runs the previous build for a minute, and pages it served ask for that build's scripts.
# They are content-hashed, so give this release a copy of them before it starts (Next lists them at start).
if [ -d "$prev/web/.next/static" ]; then cp -rn "$prev/web/.next/static/." "$R/web/.next/static/" 2>/dev/null || true; chown -R cronkick:cronkick "$R/web/.next/static"; fi
# Inside `if`, so a unit that fails to start still reaches the switch back below.
if point "$R" && healthy "$ID"; then
  echo "$(hostname) is live on $ID"
  # Keep the three newest releases (the one before is the way back).
  ls -1dt /opt/cronkick/releases/*/ | tail -n +4 | while read -r d; do [ "$(readlink -f "$d")" = "$R" ] || rm -rf "$d"; done
  exit 0
fi
journalctl -u cronkick -u cronkick-web -n 40 --no-pager
echo "$(hostname) did not come up on $ID; switching back to $prev"
point "$prev"
healthy "$(cat "$prev/web/.deployment-id")" && echo "back on the previous release" || echo "the previous release is not healthy either"
exit 1
EOF
  ;;

*) echo "unknown step: $step"; exit 1 ;;
esac
