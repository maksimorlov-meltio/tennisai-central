# Running TennisAI on your own server

This replaces the Vercel + Render + Neon setup with three containers on one
machine. Everything — site, API, database — answers on a single hostname, so
the browser only ever makes same-origin requests and CORS stops being a thing
that can break.

```
        internet
           |
      :80  :443            Caddy   (HTTPS, Let's Encrypt, serves the SPA)
           |                 |
           |            /api |
           |                 v
           |                api    (Express + Prisma)          not published
           |                 |
           |                 v
           +---------------- db     (PostgreSQL, volume: pgdata) not published
```

Only 80 and 443 are reachable from outside. The API and the database have no
published ports at all; they talk over the compose network.

## First install

On the server, as root:

```bash
git clone https://github.com/SOMAXOrlov/tennisai-central.git /opt/tennisai
cd /opt/tennisai && bash deploy/hetzner/setup.sh
```

`setup.sh` installs Docker if missing, opens 80/443 in ufw, writes a `.env`
with freshly generated secrets, and builds and starts everything. It is safe to
re-run — an existing `.env` is never overwritten.

If a **Hetzner Cloud Firewall** is attached to the server, 80 and 443 have to be
allowed there as well. That lives in the console, not on the machine, so no
script can do it for you.

## The hostname

`SITE_ADDRESS` in `.env` decides both the certificate and the URL. Out of the
box `setup.sh` fills in `<your-ip-with-dashes>.sslip.io`, a free wildcard-DNS
name that resolves straight back to this server. It is genuine HTTPS and needs
no DNS setup at all.

To move to a real domain later: point an A record at the server's IP, change
`SITE_ADDRESS`, then `docker compose up -d`. Caddy fetches the new certificate
by itself. Takes about a minute.

## Updating

```bash
cd /opt/tennisai && bash deploy/hetzner/update.sh
```

Pulls, rebuilds, restarts. Database and `.env` are outside git and untouched.

## Backups

The database now shares a disk with the app, so nothing else holds a copy.
`backup.sh` writes a compressed dump to `/opt/tennisai/backups` and keeps the
last 14. Install it as a nightly job:

```bash
( crontab -l 2>/dev/null; echo "17 3 * * * bash /opt/tennisai/deploy/hetzner/backup.sh >> /var/log/tennisai-backup.log 2>&1" ) | crontab -
```

Restoring:

```bash
cd /opt/tennisai/deploy/hetzner
gunzip -c /opt/tennisai/backups/tennisai_YYYY-MM-DD_HHMM.sql.gz \
  | docker compose exec -T db psql -U tennisai -d tennisai
```

## Email

`REQUIRE_EMAIL_VERIFICATION=false` until Gmail credentials exist. Turning
verification on without `GMAIL_USER` and `GMAIL_APP_PASSWORD` set tells every
new account to check an inbox that will never receive anything, and they can
never log in. Set all three together, then `docker compose up -d`.

## Everyday commands

```bash
cd /opt/tennisai/deploy/hetzner
docker compose ps                 # what's running
docker compose logs -f api        # API log
docker compose logs -f web        # Caddy / certificate log
docker compose restart api        # restart just the API
curl -s localhost/api/health      # is it alive
```

## Note on this machine

This server also runs the NOOMA Telegram bot. TennisAI is a separate compose
project on its own network and shares nothing with it, but they do share one
CPU, 4 GB of RAM and one disk — a full disk or a reboot affects both.
