# Deploying Ontime (PRD §10)

Nothing here runs by itself. Every `doctl` command creates paid resources (or uses credit), so check §10.1 of the PRD first.

## 1. Register the GitHub App

GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.

| Setting | Value |
|---|---|
| Homepage URL | `https://ontime.dev` |
| Callback URL | `https://ontime.dev/callback` |
| Request user authorization (OAuth) during installation | off (users sign in from the site) |
| Webhook URL | `https://ontime.dev/webhooks` |
| Webhook secret | `openssl rand -hex 32` → `GITHUB_WEBHOOK_SECRET` |
| Repository permissions | Actions: **Read and write** · Contents: **Read-only** · Metadata: **Read-only** |
| Subscribe to events | Installation target is automatic · **Push** · **Workflow run** |
| Where can it be installed | Any account |

Then generate a private key (`.pem`) and a client secret. Note the App ID, slug, and client ID.

`installation` and `installation_repositories` events are always sent to GitHub Apps; no checkbox needed.

## 2. Droplet (PRD §10.2, Option A)

Run the `doctl` commands in PRD §10.2: droplet, reserved IP, firewall. Then SSH in:

```bash
# Node 22, Postgres 17, Caddy
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs
sudo apt-get install -y postgresql-17 caddy   # add the PGDG apt repo first if 17 isn't in Ubuntu's
sudo -u postgres createuser ontime && sudo -u postgres createdb -O ontime ontime
sudo -u postgres psql -c "ALTER USER ontime PASSWORD '<strong password>'"

sudo useradd --system --home /opt/ontime ontime
sudo mkdir -p /opt/ontime /etc/ontime && sudo chown ontime /opt/ontime
# copy the repo to /opt/ontime, then:
cd /opt/ontime && sudo -u ontime npm ci --omit=dev
```

## 3. Secrets

Write `/etc/ontime/env` from `.env.example`, owned by root and mode `600`. The App private key lives only in that file, readable only by root (systemd reads it before dropping to the `ontime` user), so it's never in the repo or the database (R2). Back up the droplet with DigitalOcean's encrypted backups (`--enable-backups`).

```bash
sudo chmod 600 /etc/ontime/env && sudo chown root:root /etc/ontime/env
```

## 4. Start

```bash
sudo cp deploy/ontime.service /etc/systemd/system/ && sudo systemctl daemon-reload
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
sudo systemctl enable --now ontime   # migrations run on boot
curl https://ontime.dev/healthz       # → ok
```

## 5. Billing stub

Until Polar or Dodo is wired up (R14), set a paying account's plan by hand:

```bash
cd /opt/ontime && sudo -u ontime env $(sudo cat /etc/ontime/env | xargs) npm run plan:set -- acme pro
```

## 6. Probes

See `probe/README.md`, then set `PROBE_REPOS` and `PROBE_TOKEN` and restart.

## Operating notes

- Logs: `journalctl -u ontime -f`.
- One process runs both the web server and the scheduler. Restarting during a dispatch waits up to 15 s; a slot cut off mid-call shows as `unknown`, never fired twice.
- Before launch, check the delivery gate (PRD §11): ≥1,000 real slots, ≥99% first attempts within 30 s:
  ```sql
  SELECT count(*), avg((first_attempt_at - due_at) <= interval '30 seconds')::float AS within_30s
    FROM slots WHERE first_attempt_at IS NOT NULL;
  ```
