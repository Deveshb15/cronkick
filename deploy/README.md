# Deploying Cronkick

Setup until February 2027 (DigitalOcean credit), then move to AWS (see the end).

```
GitHub webhooks / users
        │  https://cronkick.xyz
   Cloudflare (DNS, proxied)
        │  TLS with a Cloudflare Origin certificate
   DO load balancer (nyc3) ── health check /healthz
     ┌──┴──┐
 cronkick-1  cronkick-2     (s-2vcpu-4gb, systemd, port 3000, reachable only from the LB)
     └──┬──┘
 Managed Postgres 17, primary + standby (private network)
```

Both droplets do everything: web, webhooks, dispatch. Postgres row locks (`SKIP LOCKED`) stop them firing the same slot, alerts are claimed in the database before sending, and migrations take an advisory lock. Losing a droplet loses nothing; the other keeps firing.

Cost: 2 × $24 droplets + $10 backups + $12 load balancer + ~$60 Postgres with standby ≈ **$130/mo**, covered by credit.

Every `doctl` command below creates billed resources. Check `doctl balance get` first.

---

## 1. Domain: `cronkick.xyz` (Cloudflare)

`devesh.fun` is on Cloudflare nameservers, so everything happens there.

1. Do step 4 (load balancer) first to get its IP.
2. Cloudflare → `devesh.fun` → **DNS → Add record**: Type `A`, Name `cronkick`, IPv4 = the load balancer IP, Proxy status **Proxied** (orange cloud).
3. **SSL/TLS → Overview**: set encryption mode to **Full (strict)**.
4. **SSL/TLS → Origin Server → Create certificate**: hostnames `cronkick.xyz`, validity 15 years. Save the certificate as `origin.pem` and the key as `origin-key.pem` (only on your laptop, not in the repo). These go on the load balancer in step 4.
5. **Security → Bots**: leave Bot Fight Mode **off**. It can challenge GitHub's webhook deliveries.

## 2. Email: Resend

1. Sign up at resend.com.
2. **Domains → Add domain** → `mail.cronkick.xyz` (a subdomain keeps alert-sending reputation separate from `devesh.fun`).
3. Resend shows 3–4 DNS records (an MX and TXT for SPF on `send.mail.cronkick`, a DKIM TXT `resend._domainkey.mail.cronkick`). Add each in Cloudflare DNS exactly as shown, **DNS only** (grey cloud).
4. Optional but recommended: add a DMARC TXT record, name `_dmarc.mail.cronkick`, value `v=DMARC1; p=none;`.
5. Click **Verify** in Resend (minutes to an hour).
6. **API Keys → Create**: permission *Sending access*, domain `mail.cronkick.xyz`. Put it in `RESEND_API_KEY`; set `MAIL_FROM=Cronkick <alerts@mail.cronkick.xyz>`.

## 3. GitHub App

**Fastest:** `npx tsx scripts/create-github-app.ts`, open http://localhost:3456, click through, and press **Create GitHub App** on GitHub. Every setting below is filled in for you, and the credentials land in `.env.production` (mode 600, gitignored). Add `--org <name>` to create it under an organization.

Or by hand:

github.com → your avatar → **Settings → Developer settings → GitHub Apps → New GitHub App**. Create it under your personal account now; you can transfer it to an organization later.

| Field | Value |
|---|---|
| GitHub App name | the product name (it becomes the slug in `github.com/apps/<slug>`) |
| Homepage URL | `https://cronkick.xyz` |
| Callback URL | `https://cronkick.xyz/callback` |
| Expire user authorization tokens | on |
| Request user authorization (OAuth) during installation | off |
| Webhook → Active | on |
| Webhook URL | `https://cronkick.xyz/webhooks` |
| Webhook secret | output of `openssl rand -hex 32` → `GITHUB_WEBHOOK_SECRET` |
| Repository permissions | **Actions: Read and write**, **Contents: Read-only**, Metadata: Read-only (automatic) |
| Account permissions | none |
| Subscribe to events | **Push**, **Workflow run** (`installation` events are always sent) |
| Where can this GitHub App be installed? | **Any account** |

After **Create GitHub App**:
1. Note the **App ID** → `GITHUB_APP_ID`, the slug from the public page URL → `GITHUB_APP_SLUG`, and the **Client ID** → `GITHUB_CLIENT_ID`.
2. **Generate a new client secret** → `GITHUB_CLIENT_SECRET`.
3. **Generate a private key** (downloads a `.pem`). Turn it into one line for the env file: `awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' key.pem` → `GITHUB_PRIVATE_KEY`. Then delete the download.
4. Optional: upload a logo under **Display information**.

Install it on one of your own repos first (the public page → **Install**) to dogfood before anyone else does.

The Marketplace listing comes later (Settings → Developer settings → your app → **List in Marketplace**). It needs the privacy and terms URLs: `https://cronkick.xyz/privacy` and `/terms`.

## 4. DigitalOcean

```bash
doctl compute ssh-key list
SSH_KEYS="$(doctl compute ssh-key list --format ID --no-header | paste -sd, -)"

# Postgres 17: primary + standby (automatic failover)
doctl databases create cronkick-db --engine pg --version 17 --size db-s-1vcpu-2gb --num-nodes 2 --region nyc3 --wait
DB_ID=$(doctl databases list --format ID,Name --no-header | awk '$2=="cronkick-db"{print $1}')
doctl databases db create $DB_ID cronkick
doctl databases user create $DB_ID cronkick

# Two droplets
doctl compute droplet create cronkick-1 cronkick-2 \
  --region nyc3 --size s-2vcpu-4gb --image ubuntu-24-04-x64 --ssh-keys "$SSH_KEYS" \
  --enable-monitoring --enable-backups --tag-name cronkick --user-data-file deploy/cloud-init.yml --wait

# Only the droplets may reach Postgres
doctl databases firewalls append $DB_ID --rule tag:cronkick
doctl databases connection $DB_ID --private --format URI   # use user "cronkick" / db "cronkick" in this URI → DATABASE_URL
doctl databases get-ca $DB_ID --format Certificate --no-header | base64 -d > do-ca.crt   # copy to /etc/cronkick/do-ca.crt on each droplet
# DATABASE_URL must end with ?sslmode=verify-full&sslrootcert=/etc/cronkick/do-ca.crt (DO's CA isn't in the default trust store)

# Load balancer with the Cloudflare origin certificate
CERT_ID=$(doctl compute certificate create --name cf-origin-cronkick --type custom \
  --leaf-certificate-path origin.pem --private-key-path origin-key.pem --format ID --no-header)
doctl compute load-balancer create --name cronkick-lb --region nyc3 --tag-name cronkick \
  --forwarding-rules "entry_protocol:https,entry_port:443,target_protocol:http,target_port:3000,certificate_id:$CERT_ID" \
  --health-check protocol:http,port:3000,path:/healthz,check_interval_seconds:10,response_timeout_seconds:5,healthy_threshold:3,unhealthy_threshold:3
LB_ID=$(doctl compute load-balancer list --format ID,Name --no-header | awk '$2=="cronkick-lb"{print $1}')
doctl compute load-balancer get $LB_ID --format IP          # → the Cloudflare A record in step 1

# Droplets: SSH from your IP only; port 3000 from the load balancer only
MY_IP=$(curl -s https://ifconfig.me)
doctl compute firewall create --name cronkick-fw --tag-names cronkick \
  --inbound-rules "protocol:tcp,ports:22,address:$MY_IP/32 protocol:tcp,ports:3000,load_balancer_uid:$LB_ID" \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0"
```

## 5. Secrets and first deploy

On **each** droplet, write `/etc/cronkick/env` from `.env.example` (same values on both):

```bash
ssh root@<ip> 'cat > /etc/cronkick/env && chmod 600 /etc/cronkick/env' < my-prod.env
```

The App private key lives only in that root-only file: not in the repo, not in the database. Then, from your laptop:

```bash
deploy/push.sh <ip-1> <ip-2>     # one at a time; waits for /healthz before the next
curl https://cronkick.xyz/healthz   # → ok
```

Run `push.sh` the same way for every later release. Migrations run on boot.

## 6. Monitoring

- **Uptime:** a free check on `https://cronkick.xyz/healthz` every minute (Better Stack or UptimeRobot), alerting your phone.
- **DigitalOcean:** `doctl monitoring alert create --type v1/insights/droplet/cpu --compare GreaterThan --value 80 --window 5m --tag-name cronkick --emails <you> --description "cronkick cpu"`.
- **Clock:** `ssh root@<ip> timedatectl` should say `System clock synchronized: yes`.
- **Logs:** `ssh root@<ip> journalctl -u cronkick -f`.
- **Delivery gate (PRD §11):** at least 1,000 slots and 99% first attempts within 30 s:
  ```sql
  SELECT count(*), avg(((first_attempt_at - due_at) <= interval '30 seconds')::int) AS within_30s
    FROM slots WHERE first_attempt_at IS NOT NULL;
  ```

## 7. Billing stub

Until Polar or Dodo is wired up:

```bash
ssh root@<ip> 'cd /opt/cronkick && set -a && . /etc/cronkick/env && sudo -E -u cronkick node_modules/.bin/tsx scripts/set-plan.ts acme pro'
```

## 8. Moving to AWS (February)

Nothing in the code is DigitalOcean-specific.
1. Postgres → RDS for PostgreSQL 17 (Multi-AZ): `pg_dump` from DO, `pg_restore` into RDS, during a short pause.
2. App → the `Dockerfile` on ECS Fargate (2+ tasks behind an ALB; autoscaling optional). Env vars from Secrets Manager.
3. Point the Cloudflare record at the ALB. The GitHub App URLs don't change if the domain stays.
4. Delete the DO resources: `doctl compute load-balancer delete`, `droplet delete`, `databases delete`, `certificate delete`, `firewall delete`.
