#!/usr/bin/env bash
# CI only. `open` lets this runner reach SSH on the droplets: it adds the runner's IP to the DigitalOcean
# firewall and installs the deploy key. `close` removes the rule again; run it even when the job fails.
# ponytail: a runner killed before `close` leaves its /32 rule behind (SSH is still key-only); delete it in the DO console.
set -euo pipefail
ip=$(curl -fsS https://api.ipify.org)
rule="{\"inbound_rules\":[{\"protocol\":\"tcp\",\"ports\":\"22\",\"sources\":{\"addresses\":[\"$ip/32\"]}}]}"
api() { curl -fsS -X "$1" -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" -H 'Content-Type: application/json' -d "$rule" "https://api.digitalocean.com/v2/firewalls/$FIREWALL_ID/rules"; }

case ${1:?open or close} in
open)
  install -d -m 700 ~/.ssh
  printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/id_ed25519 && chmod 600 ~/.ssh/id_ed25519
  printf '%s\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
  api POST
  # The rule takes a few seconds to reach the droplets.
  for h in $HOSTS; do
    for _ in $(seq 1 30); do ssh -o BatchMode=yes -o ConnectTimeout=3 "root@$h" true 2>/dev/null && continue 2; sleep 2; done
    echo "can't reach $h over SSH"; exit 1
  done
  echo "SSH open for $ip"
  ;;
close) api DELETE && echo "SSH closed for $ip" ;;
esac
