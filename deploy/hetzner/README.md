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

Nothing is sent until a transport is configured, and there are two:

**Gmail** — needs 2-Step Verification on the Google account first, then an app
password from `myaccount.google.com/apppasswords`:

```
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=the-16-characters
```

**Any SMTP provider** (Resend, Brevo, Mailgun, Postmark) — for when the Gmail
account cannot have 2-Step Verification switched on:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=the-api-key
MAIL_FROM=no-reply@your-domain      # must be authorised by the provider
```

Set `REQUIRE_EMAIL_VERIFICATION=true` in the **same edit**, then
`docker compose up -d`. The API checks the credentials at boot and logs whether
they authenticated — `docker compose logs api | grep Mail`.

Until a transport exists the server is honest rather than broken: **signup is
refused** with 503 (instead of creating accounts nobody can ever log into), and
password reset says it is unavailable instead of promising a link. `/api/health`
reports `mailTransport` and `signupOpen` so this is visible without SSH.

### Resetting one person's password without email

```bash
cd /opt/tennisai/deploy/hetzner
docker compose exec api npm run reset-link -- someone@example.com
```

Prints a single-use link. Give it to them directly — anyone holding it can set
that account's password, which is why it is a shell command and not an endpoint.

## The tournament calendar

Two feeds, refreshed once a day.

**UTR** is pulled by the API itself at 04:00 UTC (`FEED_REFRESH_HOUR_UTC`). It
needs nothing configured: UTR's event search answers plain HTTPS with no browser
and no credentials.

**ITF Juniors** (and later ATP/WTA) sit behind bot protection and only render in
a real browser, so they are collected by a GitHub Actions job and posted to
`/api/feed/tournaments`. Chromium never runs on this server.

To switch that on, two things:

```bash
# 1. read the token setup.sh generated
grep FEED_PUSH_TOKEN /opt/tennisai/deploy/hetzner/.env
```

2. Add it to the repository's **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `TENNISAI_API_URL` | `https://46-225-83-85.sslip.io/api` |
| `TENNISAI_FEED_TOKEN` | the `FEED_PUSH_TOKEN` above |

Leave `FEED_PUSH_TOKEN` blank and the ingest endpoint is switched off entirely,
which is the right default for a server nobody is posting to.

Check what the feeds last did — no SSH required:

```bash
curl -s https://46-225-83-85.sslip.io/api/health | jq .calendar
```

A source that has stopped is otherwise invisible: the app keeps showing last
week's tournaments and looks perfectly healthy.

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
